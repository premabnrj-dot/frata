import { createHash, createHmac } from 'node:crypto'

// =============================================================================
// FILE: src/lib/email/sigv4.ts — AWS SIGNATURE VERSION 4 for the two calls we make (SES v2 JSON, STS query; ADR-0011:
// no AWS SDK). Pure apart from node:crypto. Tested against AWS's published "get-vanilla" vector.
// =============================================================================

export type AwsCreds = { accessKeyId: string; secretAccessKey: string; sessionToken?: string }

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
const hmac = (k: Buffer | string, s: string) => createHmac('sha256', k).update(s, 'utf8').digest()
// RFC 3986: encodeURIComponent leaves !'()* alone; SigV4 wants them encoded.
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

export const amzDate = (d: Date) => d.toISOString().replace(/[:-]|\.\d{3}/g, '')

/** Signs a request; returns the headers to send (Authorization, X-Amz-Date, the token, and those given). */
export function signV4(r: {
  method: string; url: string; body: string; headers: Record<string, string>
  region: string; service: string; creds: AwsCreds; now: Date
}): Record<string, string> {
  const u = new URL(r.url)
  const date = amzDate(r.now), day = date.slice(0, 8)
  const headers: Record<string, string> = { ...r.headers, host: u.host, 'x-amz-date': date }
  if (r.creds.sessionToken) headers['x-amz-security-token'] = r.creds.sessionToken
  const names = Object.keys(headers).map((h) => h.toLowerCase()).sort()
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v.trim().replace(/\s+/g, ' ')]))
  const query = [...u.searchParams.entries()].map(([k, v]) => [enc(k), enc(v)] as const).sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('&')
  const path = u.pathname.split('/').map((p) => enc(decodeURIComponent(p))).join('/') || '/'
  const canonical = [r.method, path, query, names.map((n) => `${n}:${lower[n]}\n`).join(''), names.join(';'), sha256(r.body)].join('\n')
  const scope = `${day}/${r.region}/${r.service}/aws4_request`
  const toSign = ['AWS4-HMAC-SHA256', date, scope, sha256(canonical)].join('\n')
  const key = hmac(hmac(hmac(hmac(`AWS4${r.creds.secretAccessKey}`, day), r.region), r.service), 'aws4_request')
  const signature = createHmac('sha256', key).update(toSign, 'utf8').digest('hex')
  const out: Record<string, string> = { ...r.headers, 'x-amz-date': date, authorization: `AWS4-HMAC-SHA256 Credential=${r.creds.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` }
  if (r.creds.sessionToken) out['x-amz-security-token'] = r.creds.sessionToken
  return out
}
