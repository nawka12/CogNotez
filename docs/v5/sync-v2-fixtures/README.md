# Sync v2 fixtures

Vectors from the desktop implementation for `docs/v5/sync-v2.md` §11. An implementation is conformant when it reproduces every one of them. `desktop-v5/tests/sync-fixtures.test.ts` re-derives them from the code and checks them against these files. To regenerate after a deliberate protocol change, run `UPDATE_SYNC_FIXTURES=1 npx vitest run tests/sync-fixtures` from `desktop-v5/`.

Binary values are lower-case hex, except where the spec says base64 (`meta.json` fields and `blob`). Every object file's bytes are the UTF-8 of its object as JSON with keys sorted and no whitespace (§5).

## crypto.json
- `kdf[]`: `{passphrase, salt (hex), iter, iterUsed, kek (hex)}`. `iterUsed` is `iter` after the clamp to 100 000..2 000 000.
- `meta`: `json` is a complete encrypted `meta.json`. Unwrapping it with `passphrase` gives `dek`; `wrongPassphrase` must fail. `wrapAad` is the AAD of the wrap.
- `object`: encrypting `plaintext` (UTF-8) under `dek` with `iv` and AAD `aad` (the `name` without `.bin`) gives `blob` (base64 of `iv ‖ ciphertext ‖ tag`). `plaintext` is also the exact serialization of that object.
- `media`: `plaintext` (hex) has `sha256`; HMAC-SHA256(`dek`, `hmacInput`) gives the key in `name`; encrypting with `iv` and AAD `aad` gives `blob`. `plaintextName` is the name on a plaintext remote.

## names.json
- `valid.objects[]`: `{name, id, rev, parents, encrypted}` as parsed from the name. `valid.media[]`: `{name, key, encrypted}`.
- `invalid[]`: `{name, why}`. A reader must ignore every one of these names.
- `mergeRevs[]`: `{parents, hashInput, rev}`: `rev` is the merge rev for that parent set, in any input order. `hashInput` is the sha256 input.
- `copyIds[]`: `{noteId, losingRev, input, id}` for conflicted copies.

## merge-*.json
Each file is an array of cases, one or more per rule in §8, grouped as `scalars`, `tags`, `content`, `tombstones` and `base`:

```
{ "name": "…", "rule": "§8 …",
  "graph": [ { "name": "<object file name>", "object": { … } }
           | { "name": "<object file name>", "raw": "<file text that fails validation>" } ],
  "expected": { "writes": [ { "name": "…", "object": { … } } ], "head": "<rev>" } }
```

To run a case, build the note's graph from the `graph` names alone. Find its heads and fold them (§8), reading objects by name; a `raw` entry is unreadable. `expected.writes` lists every file the fold creates, in write order: each step's conflicted copy comes before its merge revision. `expected.head` is the rev of the single head afterwards. All objects are plaintext (`.json`); encryption doesn't change merge results.
