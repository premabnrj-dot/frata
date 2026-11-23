// =============================================================================
// FILE: src/domains/studio/archive.ts — STARTER 0 AS ONE FILE FOR THE SESSION (plan docs/plans/2026-11-22-v3a-runtime.md
// § The first test, step 3). Until the site repository exists (V3a·7) the agent's starting code is `kit/starter`, packed
// as a plain ustar archive and mounted as a session file; the sandbox unpacks it with `tar -xf`. Paths are relative,
// never absolute or with `..`, at most 100 bytes (no long-name extension needed for the kit). Deterministic: the same
// files give the same bytes (mtime 0, mode 0644, sorted), so the same kit has the same sha256. Pure.
// =============================================================================

export type ArchiveFile = { path: string; bytes: Uint8Array }

const enc = new TextEncoder()

/** A path the archive may hold, or null. */
export function archivePath(p: string): string | null {
  const s = p.replace(/\\/g, '/')
  if (!s || s.startsWith('/') || s.split('/').some((x) => x === '..' || x === '') || enc.encode(s).length > 100) return null
  return s
}

function header(path: string, size: number): Uint8Array {
  const h = new Uint8Array(512)
  const put = (off: number, len: number, v: string) => h.set(enc.encode(v).subarray(0, len), off)
  const oct = (n: number, len: number) => n.toString(8).padStart(len - 1, '0') + '\0'
  put(0, 100, path)
  put(100, 8, oct(0o644, 8))
  put(108, 8, oct(0, 8))
  put(116, 8, oct(0, 8))
  put(124, 12, oct(size, 12))
  put(136, 12, oct(0, 12))
  put(148, 8, '        ')
  put(156, 1, '0')
  put(257, 6, 'ustar\0')
  put(263, 2, '00')
  let sum = 0
  for (const b of h) sum += b
  put(148, 8, sum.toString(8).padStart(6, '0') + '\0 ')
  return h
}

/** The archive's bytes; throws on a path it may not hold (a kit bug, never input). */
export function tarOf(files: readonly ArchiveFile[]): Uint8Array {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  const parts: Uint8Array[] = []
  for (const f of sorted) {
    const path = archivePath(f.path)
    if (!path) throw new Error(`archive: bad path ${f.path.slice(0, 120)}`)
    parts.push(header(path, f.bytes.length), f.bytes, new Uint8Array((512 - (f.bytes.length % 512)) % 512))
  }
  parts.push(new Uint8Array(1024))
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}
