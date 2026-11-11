import 'server-only'
import { createVerify } from 'node:crypto'
import { fakeBase } from '@/lib/connectors/http'
import { E2E_FIXTURES, SES_API_BASE, SES_SNS_TOPIC_ARN, VERCEL_ENV } from '@/lib/env'
import { fetchWithTimeout } from '@/lib/http/timeout'
import { SES_REGION } from './ses'

// =============================================================================
// FILE: src/lib/email/sns.ts — AN SNS MESSAGE IS FROM OUR TOPIC, SIGNED BY AWS, AND RECENT (ADR-0011; security review
// H2). Checked in this order, before anything is fetched: header and body agree on the type; the TopicArn is ours
// (every type — anyone can make a topic, and its messages carry valid AWS signatures); SignatureVersion 2 (SHA256);
// the certificate URL is https on exactly sns.ap-south-1.amazonaws.com; the message is under an hour old. Then the
// signature over SNS's documented field list (it signs fields, not the raw body; frata-integrations § Email).
// =============================================================================

export type SnsMessage = {
  Type: 'Notification' | 'SubscriptionConfirmation' | 'UnsubscribeConfirmation'
  MessageId: string; TopicArn: string; Message: string; Timestamp: string
  SignatureVersion: string; Signature: string; SigningCertURL: string
  Subject?: string; SubscribeURL?: string; Token?: string
}

const NOTIFICATION = ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'] as const
const CONFIRMATION = ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'] as const

/** The e2e certificate host: honoured only off Vercel, under E2E_FIXTURES, on 127.0.0.1 (security review L1). */
const testBase = () => (VERCEL_ENV === '' && E2E_FIXTURES ? fakeBase(SES_API_BASE) : null)

export function certUrlOk(u: string): boolean {
  const t = testBase()
  if (t && u.startsWith(`${t}/`)) return /^\/SimpleNotificationService-[A-Za-z0-9]+\.pem$/.test(new URL(u).pathname)
  try {
    const url = new URL(u)
    return url.protocol === 'https:' && url.host === `sns.${SES_REGION}.amazonaws.com` && /^\/SimpleNotificationService-[A-Za-z0-9]+\.pem$/.test(url.pathname) && !url.search
  } catch { return false }
}

/** A SubscribeURL we may visit: SNS's own host, ConfirmSubscription, for our topic. */
export function subscribeUrlOk(u: string): boolean {
  const t = testBase()
  try {
    const url = new URL(u)
    const host = t ? url.origin === t : url.protocol === 'https:' && url.host === `sns.${SES_REGION}.amazonaws.com`
    return host && url.searchParams.get('Action') === 'ConfirmSubscription' && url.searchParams.get('TopicArn') === SES_SNS_TOPIC_ARN
  } catch { return false }
}

export function stringToSign(m: SnsMessage): string {
  const fields = m.Type === 'Notification' ? NOTIFICATION : CONFIRMATION
  return fields.filter((f) => f !== 'Subject' || m.Subject !== undefined).map((f) => `${f}\n${String(m[f as keyof SnsMessage] ?? '')}\n`).join('')
}

const certs = new Map<string, string>()

async function cert(url: string): Promise<string | null> {
  const hit = certs.get(url)
  if (hit) return hit
  const r = await fetchWithTimeout(url, { redirect: 'manual' }, 5_000)
  if (!r.ok) return null
  const pem = await r.text()
  // AWS serves an X.509 certificate; the e2e fake serves a bare public key (only reachable through testBase()).
  const ok = /^-----BEGIN CERTIFICATE-----/.test(pem.trim()) || (testBase() !== null && /^-----BEGIN PUBLIC KEY-----/.test(pem.trim()))
  if (!ok || pem.length > 10_000) return null
  if (certs.size > 20) certs.clear()
  certs.set(url, pem)
  return pem
}

export type Verdict = { ok: true; message: SnsMessage } | { ok: false; reason: string }

/** Parses and verifies a POST from SNS. `headerType` is x-amz-sns-message-type. */
export async function verifySns(body: string, headerType: string | null, now: Date): Promise<Verdict> {
  let m: SnsMessage
  try { m = JSON.parse(body) as SnsMessage } catch { return { ok: false, reason: 'json' } }
  if (!m || typeof m !== 'object' || !['Notification', 'SubscriptionConfirmation', 'UnsubscribeConfirmation'].includes(m.Type)) return { ok: false, reason: 'type' }
  if (headerType !== m.Type) return { ok: false, reason: 'type_header' }
  if (!SES_SNS_TOPIC_ARN || m.TopicArn !== SES_SNS_TOPIC_ARN) return { ok: false, reason: 'topic' }
  if (m.SignatureVersion !== '2') return { ok: false, reason: 'version' }
  if (typeof m.SigningCertURL !== 'string' || !certUrlOk(m.SigningCertURL)) return { ok: false, reason: 'cert_url' }
  const at = Date.parse(m.Timestamp)
  if (!Number.isFinite(at) || Math.abs(now.getTime() - at) > 3600_000) return { ok: false, reason: 'stale' }
  if (m.Type !== 'Notification' && (typeof m.SubscribeURL !== 'string' || !subscribeUrlOk(m.SubscribeURL))) return { ok: false, reason: 'subscribe_url' }
  const pem = await cert(m.SigningCertURL).catch(() => null)
  if (!pem) return { ok: false, reason: 'cert' }
  try {
    const v = createVerify('RSA-SHA256')
    v.update(stringToSign(m), 'utf8')
    if (!v.verify(pem, m.Signature, 'base64')) return { ok: false, reason: 'signature' }
  } catch { return { ok: false, reason: 'signature' } }
  return { ok: true, message: m }
}
