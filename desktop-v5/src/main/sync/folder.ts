// Folder transport (docs/v5/sync-v2.md §10): a directory the user picked, often synced by Syncthing/Dropbox/Nextcloud.
// create() writes a temp file and hard-links it to the final name, so an existing name is never overwritten (EEXIST).
import { randomUUID } from 'node:crypto'
import { link, mkdir, open, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { SyncError } from './transport'
import type { ListResult, RemoteEntry, Transport } from './transport'

const NAME_RE = /^(meta\.json|(objects|media)\/[A-Za-z0-9_~+-][A-Za-z0-9._~+-]*)$/
/** Our own temp files plus sync-tool leftovers: `.syncthing.*`, `*.sync-conflict-*`, Dropbox "(conflicted copy)". */
const isForeign = (f: string): boolean =>
  f.startsWith('.') || f.startsWith('~') || f.includes('sync-conflict') || !/^[A-Za-z0-9._~+-]+$/.test(f)

const code = (e: unknown): string | undefined => (e as NodeJS.ErrnoException)?.code

export function createFolderTransport(root: string): Transport {
  const path = (name: string): string => {
    if (!NAME_RE.test(name) || name.includes('..')) throw new Error(`invalid sync file name: ${name}`)
    return join(root, name)
  }

  /** O_EXCL fallback for file systems without hard links (FAT, some network shares). Not atomic. */
  async function createExclusive(file: string, bytes: Uint8Array): Promise<'created' | 'exists'> {
    let fh
    try {
      fh = await open(file, 'wx', 0o600)
    } catch (e) {
      if (code(e) === 'EEXIST') return 'exists'
      throw e
    }
    try {
      await fh.writeFile(bytes)
      await fh.sync()
    } finally {
      await fh.close()
    }
    return 'created'
  }

  return {
    kind: 'folder',
    describe: () => root,
    async ensureRoot() {
      await mkdir(join(root, 'objects'), { recursive: true })
      await mkdir(join(root, 'media'), { recursive: true })
    },
    async read(name) {
      try {
        return new Uint8Array(await readFile(path(name)))
      } catch (e) {
        if (code(e) !== 'ENOENT') throw e
        // A missing root (unmounted drive, renamed folder) is an error, never "the file is absent".
        if (!(await stat(root).catch(() => null))?.isDirectory()) throw new SyncError(`The sync folder is not reachable: ${root}`, { cause: e })
        return null
      }
    },
    async create(name, bytes) {
      const final = path(name)
      const tmp = join(dirname(final), `.cognotez-tmp-${randomUUID()}`)
      try {
        await writeFile(tmp, bytes, { mode: 0o600, flush: true })
        await link(tmp, final)
        return 'created'
      } catch (e) {
        if (code(e) === 'EEXIST') return 'exists'
        if (['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV'].includes(code(e) ?? '')) return createExclusive(final, bytes)
        throw e
      } finally {
        await unlink(tmp).catch(() => undefined)
      }
    },
    async list(): Promise<ListResult> {
      const added: RemoteEntry[] = []
      for (const sub of ['objects', 'media']) {
        let files: string[]
        try {
          files = await readdir(join(root, sub))
        } catch (e) {
          if (code(e) === 'ENOENT') continue
          throw e
        }
        for (const f of files) {
          if (isForeign(f)) continue
          try {
            const s = await stat(join(root, sub, f))
            if (s.isFile()) added.push({ name: `${sub}/${f}`, size: s.size })
          } catch (e) {
            if (code(e) !== 'ENOENT') throw e // vanished between readdir and stat
          }
        }
      }
      return { added, removed: [], cursor: '', full: true }
    },
    async remove(name) {
      await unlink(path(name)).catch((e: unknown) => {
        if (code(e) !== 'ENOENT') throw e
      })
    }
  }
}
