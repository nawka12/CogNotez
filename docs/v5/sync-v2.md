# CogNotez Sync v2: protocol spec (format 2)

Status: draft for the desktop implementation (2026-10-13). Android stays on format 1 until it is ported against the same fixtures.

## 1. Goals

- **Never lose an edit.** Concurrent changes always survive, merged or as a conflicted copy.
- **Never overwrite remote data.** Writers only *create* files; the one exception is GC (§9).
- **Works on dumb file stores** with no compare-and-swap: Google Drive, a local folder synced by Syncthing/Dropbox/Nextcloud, and WebDAV later.
- **Deterministic.** Two devices that see the same remote files make the same merge decisions and write files with the same names and the same content.
- **Optional end-to-end encryption.** It is chosen when the remote is created and cannot be silently downgraded.

Non-goals for 2.0: character-level merging of concurrent body edits, syncing AI chats or settings, changing the passphrase or turning encryption on or off on an existing remote. Those last two need "start over", which is a later feature.

## 2. Identifiers

| Thing | Format |
|---|---|
| Device id | `[a-z0-9]{8,32}`, random, generated once per install and stored in local settings |
| Note id | `[A-Za-z0-9_-]{8,64}` |
| Rev (edit) | `<ms 13 digits>-<counter 4 base36>-<deviceId>`, a hybrid logical clock (HLC) value |
| Rev (merge) | `<rev of greatest parent>~<first 8 hex of sha256(parents joined by "+")>` |

- **Revs order by plain string comparison.** All fields are fixed-width, and `~` sorts after every alphanumeric character, so a merge rev sorts after all of its parents.
- **Clocks.** Every device applies HLC `receive()` to each rev it reads, so its next local rev is greater than anything it has seen. Wall-clock time is never used for merge decisions.

## 3. Remote layout

```
<root>/meta.json
<root>/objects/n.<noteId>.<rev>.<parents>.json   plaintext remote
<root>/objects/n.<noteId>.<rev>.<parents>.bin    encrypted remote
<root>/media/m.<sha256hex>                       plaintext remote
<root>/media/m.<hmachex>.bin                     encrypted remote
```

- **`<parents>` field.** `0` marks a root revision. Otherwise it holds 1 to 8 revs joined by `+` and sorted ascending.
- **Names are never reused.** A writer that finds a name already present treats the write as done. The same name always means the same content, because content is determined by the name together with the deterministic rules below.
- **Readers ignore** any name that doesn't match these patterns: temp files, sync-tool conflict files and stray files.
- **Size limits.** Reject objects over 8 MB and media over 50 MB.

## 4. meta.json

```json
{ "format": 2, "created": 1791860000000, "createdBy": "<deviceId>",
  "enc": null }
```
or, for an encrypted remote:
```json
{ "format": 2, "created": 1791860000000, "createdBy": "<deviceId>",
  "enc": { "kdf": "pbkdf2-sha256", "iter": 600000, "salt": "<b64 16B>",
           "wrap": { "iv": "<b64 12B>", "ct": "<b64 32B>", "tag": "<b64 16B>" } } }
```

- **Create-only.** If a race leaves two candidates, the one with the smallest `(created, createdBy)` wins, and the losing device deletes its own copy and adopts the winner.
- **KEK** (key-encryption key) = PBKDF2-SHA256(passphrase UTF-8, salt, clamp(iter, 100 000, 2 000 000), 32 bytes).
- **DEK** (data key, 32 random bytes) = AES-256-GCM-open(KEK, wrap.iv, wrap.ct, wrap.tag, AAD = `"cognotez-sync-v2-dek"`). A failed open means the passphrase is wrong.
- **Caching.** The DEK is cached per device in the OS keychain (secret `sync_dek`). The passphrase itself is never stored.
- **No downgrade.** A device that reads `enc != null` must encrypt everything it writes. It cannot write plaintext to an encrypted remote.
- **Remote that disappears.** If the device previously synced with this remote but `meta.json` is now missing, stop with an error: "The sync location looks empty or was replaced." Never re-create it on its own.

## 5. Revision object

UTF-8 JSON:

```json
{ "v": 2, "id": "<noteId>", "rev": "<rev>", "parents": ["<rev>"],
  "device": "<deviceId>", "deviceName": "ThinkPad",
  "deleted": false,
  "title": "…", "body": "…", "tags": ["a", "b/c"],
  "pinned": false, "archived": false, "trashedAt": null,
  "createdAt": 1791860000000, "updatedAt": 1791860000000,
  "locked": false, "cipher": null, "cipherFormat": null,
  "media": ["<sha256hex>"],
  "conflictOf": null }
```

**Field rules:**
- `deleted: true` is a **tombstone** for a permanent delete. It carries only `v`, `id`, `rev`, `parents`, `device`, `deviceName` and `deleted`.
- **Locked notes** sync with `body: ""`, `locked: true`, `cipher` set to the base64 of the v5 envelope bytes, and `cipherFormat: "v5"`. Plaintext of a locked note never appears in an object.
- `media` lists the sha256 of every `cognotez-media://<sha256>` the note references, as recorded in the local `note_media` table.

**Validation on read.** The `id`, `rev` and `parents` inside the object must match its name. Every field must have the right type and length (same limits as the local guards). Objects that fail are skipped with a warning and retried next round. They are never fatal and never deleted.

**Encrypted objects and media.**
- Format: `iv(12) ‖ ciphertext ‖ tag(16)`, using AES-256-GCM with the DEK.
- AAD is the UTF-8 file path without the `.bin` extension, e.g. `objects/n.<id>.<rev>.<parents>` or `media/m.<hmachex>`.
- An encrypted media name is `m.` + hex(HMAC-SHA256(DEK, `"media:" + sha256hex`)) + `.bin`, so the remote never reveals the plaintext hash.

## 6. Local state (per device)

- `notes.rev`: the rev of the local content. Every local change gets a new HLC rev.
- `sync_state(id, base_rev, base_hash)`: the rev both sides last agreed on.
  - A note is **dirty** when `notes.rev != base_rev`.
  - `base_hash` is the sha256 of the canonical content at base, used to sanity-check.
- `purged(id, rev, purged_at)`: permanent deletes still waiting to be uploaded as tombstones.
- Transport cursor plus the set of known object names, stored in settings, for incremental listing.

**Canonical content** (for hashing and equality) is the revision object with `rev`, `parents`, `device`, `deviceName` and `updatedAt` removed. It is serialized as JSON with keys sorted.

## 7. Sync round

1. **Meta.** Read `meta.json`.
   - If it is absent and this is a first setup, create it (§4).
   - If it is encrypted, load the DEK; when no DEK is cached, ask for the passphrase.
2. **Upload local changes first.** For each dirty note, upload its current content as a revision:
   - rev = `notes.rev`;
   - parents = `[base_rev]`, or `0` if there is none.

   Upload the media it references first if they are missing. For each `purged` row, upload a tombstone with parents `[last known rev]`. Set `base_rev = notes.rev` once the create succeeds (`created` or `exists`).

   Local edits always become part of the shared graph before any merge happens, so an edit is never lost by a merge.
3. **List** objects, incrementally from the cursor or fully on the first run, and build a graph per note: nodes are revs, edges point to parents. A parent that isn't present remotely counts as *unknown*.
4. **Merge.** For each note with **more than one head** (a head is a rev that no other rev names as a parent), compute the deterministic merge (§8). Write the merge revision and any conflicted copies with create-only semantics. Every device computes identical files, so duplicate work converges.
5. **Apply** each note's single resulting head locally, in one transaction per note:
   - Skip the note if `notes.rev` changed since step 2. The user typed during the sync; the next round handles it.
   - Write the fields, set `notes.rev = head` and `base_rev = head`, and download missing media first.
   - For a tombstone head, delete the local row.
6. **Save** the cursor.

**Failures.**
- Any transport error aborts the round. Nothing is overwritten.
- Files from a half-finished round are valid objects; the next round picks them up.
- If a head equals the local `notes.rev`, recover by setting `base_rev` to it.

## 8. Deterministic merge

**Base selection.** Sort the heads ascending by rev and fold them pairwise: `acc = merge(acc, next)`. For each step, the base is the lowest common ancestor in the graph:
- take the common ancestors that are not ancestors of other common ancestors;
- if several remain (criss-cross), use the greatest rev;
- if none exist or the base object is unreadable, the base is unknown.

**Rules for `merge(a, b)`** (`b` has the greater rev):
- **Tombstones.**
  - A tombstone on one side and a changed note on the other: the *change wins*, and the result is not deleted.
  - A tombstone against an unchanged side: the result is a tombstone.
  - With an unknown base, any non-tombstone wins.
- **Scalar fields** (`title`, `pinned`, `archived`, `trashedAt`): take the value from the side that changed it relative to the base. If both changed it, or the base is unknown, and the values differ, take `b`.
- **`tags`:** (tags in either side not in base) ∪ (base tags still present on both sides). With an unknown base, the union.
- **Content** (`body`, `locked`, `cipher` and `cipherFormat` together):
  - Equal on both sides: keep it.
  - Only one side changed relative to the base: take that side.
  - Otherwise: **conflict.** `b` keeps its content, and `a`'s content goes into a conflicted copy.
- **`media`:** the union of the media that the chosen contents reference.
- **`createdAt`:** the minimum. **`updatedAt`:** the maximum.

**The merge revision** has rev = merge rev (§2), parents = all heads, `device` and `deviceName` = `"merge"`, and `updatedAt` = the maximum of the heads.

**A conflicted copy** is a new note:
- id = `c` + the first 31 hex characters of sha256(`noteId + ":" + losingRev`);
- one root revision with `rev = losingRev`, parents `0`, `device` = the loser's device, the loser's content and tags;
- title = loser title + ` (conflicted copy)`;
- `conflictOf = noteId`;
- `createdAt` and `updatedAt` = the loser's `updatedAt`.

Every field is a function of remote data, so every device writes the same file.

**Resolving.** When the user picks "Keep both", `conflictOf` is set to `null`. That is a normal local edit, so it syncs.

## 9. Garbage collection (optional, daily at most)

- **What may be deleted:** a revision that is a strict ancestor of every head of its note, is not a direct parent of a head, and has a rev timestamp older than 30 days.
- **What is never deleted:** heads (tombstones included), invalid objects, and media. Media GC is not part of 2.0.
- **Why it's safe:** a device that was offline long enough to lose its base gets "unknown base", which in the worst case produces a conflicted copy, never a loss.

## 10. Transports

**The interface** has `ensureRoot`, `read(name)`, `create(name, bytes) → created | exists`, `list(cursor)` and `remove(name)` (GC only).

- **Folder:**
  - The root is a folder the user picks.
  - Writes go to a temp file followed by a `link`/`rename` without overwriting (O_EXCL semantics).
  - `list` scans the folder. Cursors are optional.
- **Google Drive** (scope `drive.file`):
  - The root is the folder `CogNotez Sync` in My Drive, containing `objects/` and `media/`.
  - `create` checks for the name and then uploads. Duplicate names are harmless; readers deduplicate by name.
  - Incremental listing uses `changes.list` with a stored page token. OAuth uses a loopback redirect with PKCE and `state`.

## 11. Fixtures

`docs/v5/sync-v2-fixtures/` contains JSON vectors that every implementation must reproduce:
- `crypto.json`: KEK derivation, DEK unwrap, object encryption with fixed IV, encrypted media name.
- `merge-*.json`: `{graph objects, expected merged object(s), expected conflicted copies}` covering every rule in §8.
- `names.json`: valid and invalid file names.
