import 'server-only'
import { headers } from 'next/headers'

/** The caller's IP as Vercel's edge saw it: the first x-forwarded-for entry. For rate limits only — never for identity. */
export async function clientIp(): Promise<string> {
  const h = await headers()
  return (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? 'unknown').trim()
}
