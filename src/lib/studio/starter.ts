import 'server-only'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { tarOf, type ArchiveFile } from '@/domains/studio/archive'

// =============================================================================
// FILE: src/lib/studio/starter.ts — STARTER 0'S ARCHIVE (plan docs/plans/2026-11-22-v3a-runtime.md § The first test,
// step 3). `kit/starter` read from the deployment (next.config's outputFileTracingIncludes ships it with the Studio
// routes), packed by src/domains/studio/archive.ts once per process, with its sha256. Never node_modules, a build or an
// env file. Until V3a·7's repository, it is mounted as one session file and lost at the session's end.
// =============================================================================

const ROOT = join(process.cwd(), 'kit', 'starter')
const SKIP = new Set(['node_modules', '.next', '.vercel', '.git', '.turbo', 'dist', 'out', '.DS_Store'])
/** Never an env file of any name (`.env.example`, the kit's own list of names, is the one kept). */
const skipped = (n: string) => SKIP.has(n) || (n.startsWith('.env') && n !== '.env.example')

let made: { bytes: Uint8Array; sha256: string } | null = null

export function starterArchive(): { bytes: Uint8Array; sha256: string } {
  if (made) return made
  const files: ArchiveFile[] = []
  const walk = (dir: string) => {
    for (const n of readdirSync(dir).sort()) {
      if (skipped(n)) continue
      const p = join(dir, n)
      if (statSync(p).isDirectory()) walk(p)
      else files.push({ path: relative(ROOT, p).split('\\').join('/'), bytes: new Uint8Array(readFileSync(p)) })
    }
  }
  walk(ROOT)
  if (!files.length) throw new Error('starter: kit/starter is not in the deployment')
  const bytes = tarOf(files)
  made = { bytes, sha256: createHash('sha256').update(bytes).digest('hex') }
  return made
}
