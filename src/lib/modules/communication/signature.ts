import { createHmac, timingSafeEqual } from 'node:crypto'

/** Meta signs every webhook: X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(raw body, Frrata's app secret).
 *  Verified on the bytes exactly as received; a re-serialised body would not match. */
export function verifyMetaSignature(raw: string, header: string | null, secret: string): boolean {
  if (!secret || !header?.startsWith('sha256=')) return false
  const expected = Buffer.from(createHmac('sha256', secret).update(raw).digest('hex'), 'utf8')
  const got = Buffer.from(header.slice(7), 'utf8')
  return expected.length === got.length && timingSafeEqual(expected, got)
}

