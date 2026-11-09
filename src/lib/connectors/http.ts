import 'server-only'
import { fetchWithTimeout } from '@/lib/http/timeout'

// =============================================================================
// FILE: src/lib/connectors/http.ts — A CAPPED, DEADLINED JSON CALL for the domain connectors (D2·4, D2·5).
// A reply is read up to `cap` bytes and dropped past it; redirects are refused; the body is never logged.
// =============================================================================

export type Reply = { status: number; json: unknown } | { status: 0; json: null }

export async function cappedJson(url: string, init: RequestInit, opts: { ms: number; cap: number }): Promise<Reply> {
  try {
    const r = await fetchWithTimeout(url, { ...init, redirect: 'error', cache: 'no-store' }, opts.ms)
    const reader = r.body?.getReader()
    let size = 0
    const parts: Uint8Array[] = []
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > opts.cap) { await reader.cancel(); return { status: 0, json: null } }
        parts.push(value)
      }
    }
    const text = new TextDecoder().decode(Buffer.concat(parts))
    let json: unknown = null
    try { json = text ? JSON.parse(text) : null } catch { json = null }
    return { status: r.status, json }
  } catch {
    return { status: 0, json: null }
  }
}

/** A fake's base is honoured only off Vercel and only on the loopback address (e2e). */
export function fakeBase(base: string): string | null {
  if (!base || process.env.VERCEL) return null
  return /^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(base) ? base : null
}
