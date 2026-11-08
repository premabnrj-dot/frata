import 'server-only'
import { headers } from 'next/headers'

/**
 * The caller's address as Vercel's edge saw it (the first x-forwarded-for entry), as a RATE-LIMIT SUBJECT — never
 * for identity. An IPv6 address is cut to its /64: one connection is handed a whole /64, so counting each address
 * would let a guesser rotate past every limit (security review S8, 2026-11-08).
 */
export async function clientIp(): Promise<string> {
  const h = await headers()
  return ipBucket((h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? 'unknown').trim())
}

export function ipBucket(ip: string): string {
  if (!ip.includes(':')) return ip
  const bare = ip.replace(/^\[|\](:\d+)?$/g, '').split('%')[0]!.toLowerCase()
  if (/^::ffff:\d+\.\d+\.\d+\.\d+$/.test(bare)) return bare.slice(7)
  const [head = '', tail = ''] = bare.split('::')
  const h = head ? head.split(':') : []
  const t = bare.includes('::') ? (tail ? tail.split(':') : []) : []
  const full = bare.includes('::') ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h
  if (full.length !== 8 || full.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return bare
  return full.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':') + '::/64'
}
