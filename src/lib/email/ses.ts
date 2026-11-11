import 'server-only'
import { fakeBase } from '@/lib/connectors/http'
import { SES_ACCOUNT_ID, SES_API_BASE, SES_ROLE_ARN, SES_TEST_KEY } from '@/lib/env'
import { fetchWithTimeout } from '@/lib/http/timeout'
import { signV4, type AwsCreds } from './sigv4'

// =============================================================================
// FILE: src/lib/email/ses.ts — THE ONE OWNER OF AMAZON SES (ADR-0011): credentials, SendEmail, tenants. No AWS SDK:
// SigV4 over fetchWithTimeout. Endpoints are AWS's in ap-south-1; a fake's base is honoured only off Vercel and on
// 127.0.0.1 (security review S1). Credentials come from the deployment's Vercel OIDC token exchanged at STS for the
// SES role (production only); off Vercel, SES_TEST_KEY. Never logged, never stored; errors leave as codes only (S/M4).
// =============================================================================

export const SES_REGION = 'ap-south-1'
const sesBase = () => fakeBase(SES_API_BASE) ?? `https://email.${SES_REGION}.amazonaws.com`
const stsBase = () => fakeBase(SES_API_BASE) ?? `https://sts.${SES_REGION}.amazonaws.com`

let cached: { creds: AwsCreds; until: number } | null = null

const xml = (body: string, tag: string) => body.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1] ?? ''

async function credentials(now: Date): Promise<AwsCreds | null> {
  if (cached && cached.until > now.getTime()) return cached.creds
  if (!process.env.VERCEL) {
    const [id, secret] = SES_TEST_KEY.split(':')
    return id && secret ? { accessKeyId: id, secretAccessKey: secret } : null
  }
  if (!SES_ROLE_ARN) return null
  // The token is request-scoped (Vercel OIDC): every caller runs inside a route, action, cron or after().
  const { getVercelOidcToken } = await import('@vercel/functions/oidc')
  const token = await getVercelOidcToken()
  const q = new URLSearchParams({ Action: 'AssumeRoleWithWebIdentity', Version: '2011-06-15', RoleArn: SES_ROLE_ARN, RoleSessionName: 'frrata-email', DurationSeconds: '3600', WebIdentityToken: token })
  const r = await fetchWithTimeout(`${stsBase()}/?${q}`, { method: 'POST' }, 10_000)
  if (!r.ok) throw new Error(`sts_${r.status}`)
  const body = await r.text()
  const creds = { accessKeyId: xml(body, 'AccessKeyId'), secretAccessKey: xml(body, 'SecretAccessKey'), sessionToken: xml(body, 'SessionToken') }
  const expires = Date.parse(xml(body, 'Expiration'))
  if (!creds.accessKeyId || !creds.secretAccessKey || !Number.isFinite(expires)) throw new Error('sts_shape')
  cached = { creds, until: expires - 5 * 60_000 }
  return creds
}

type Call = { ok: true; json: Record<string, unknown> } | { ok: false; status: number; type: string }

async function call(path: string, body: object, now: Date): Promise<Call> {
  const creds = await credentials(now)
  if (!creds) return { ok: false, status: 0, type: 'not_configured' }
  const url = `${sesBase()}${path}`
  const text = JSON.stringify(body)
  const headers = signV4({ method: 'POST', url, body: text, headers: { 'content-type': 'application/json' }, region: SES_REGION, service: 'ses', creds, now })
  const r = await fetchWithTimeout(url, { method: 'POST', headers, body: text }, 15_000)
  const json = (await r.json().catch(() => ({}))) as Record<string, unknown>
  if (r.ok) return { ok: true, json }
  // The error's type only (its message can quote an address: security review M4).
  const type = String(r.headers.get('x-amzn-errortype') ?? json.__type ?? json.code ?? 'unknown').split(':')[0]!.split('#').pop()!.replace(/[^A-Za-z]/g, '').slice(0, 40)
  return { ok: false, status: r.status, type }
}

export type Outgoing = {
  from: string; to: string; replyTo: string | null; subject: string; html: string; text: string
  configurationSet: string; tenant: string; messageId: string; tenantTag: string
  headers?: { name: string; value: string }[]
}

/** retry: a 429 or 5xx or a network failure (try again, no attempt spent); otherwise a code to record. */
export type SendResult = { ok: true; providerId: string } | { ok: false; retry: boolean; code: string }

export async function sendEmail(m: Outgoing, now: Date): Promise<SendResult> {
  try {
    const r = await call('/v2/email/outbound-emails', {
      FromEmailAddress: m.from,
      Destination: { ToAddresses: [m.to] },
      ...(m.replyTo ? { ReplyToAddresses: [m.replyTo] } : {}),
      Content: { Simple: {
        Subject: { Data: m.subject, Charset: 'UTF-8' },
        Body: { Html: { Data: m.html, Charset: 'UTF-8' }, Text: { Data: m.text, Charset: 'UTF-8' } },
        ...(m.headers?.length ? { Headers: m.headers.map((h) => ({ Name: h.name, Value: h.value })) } : {}),
      } },
      ConfigurationSetName: m.configurationSet,
      TenantName: m.tenant,
      // SES overwrites Message-ID: our id travels as a tag and comes back on every event (frata-integrations § Email).
      EmailTags: [{ Name: 'm', Value: m.messageId }, { Name: 't', Value: m.tenantTag }],
    }, now)
    if (r.ok) return typeof r.json.MessageId === 'string' ? { ok: true, providerId: r.json.MessageId.slice(0, 200) } : { ok: false, retry: true, code: 'ses_shape' }
    if (r.status === 0) return { ok: false, retry: false, code: 'not_configured' }
    if (r.status === 429 || r.status >= 500) return { ok: false, retry: true, code: `ses_${r.status}` }
    return { ok: false, retry: false, code: `ses_${r.type || r.status}`.slice(0, 48) }
  } catch (err) {
    return { ok: false, retry: true, code: err instanceof Error && /^sts_/.test(err.message) ? err.message : 'ses_network' }
  }
}

/** The SES tenant name for a shop (≤ 64, [A-Za-z0-9_-]). */
export const tenantName = (tenantId: string) => `t-${tenantId}`

const arn = (kind: 'identity' | 'configuration-set', name: string) => `arn:aws:ses:${SES_REGION}:${SES_ACCOUNT_ID}:${kind}/${name}`

/** Creates a shop's SES tenant and associates the shared identity and configuration set (each call 1/s: paced by the
 *  email.tenant outbox kind). Already-exists counts as done. */
export async function setUpTenant(name: string, identity: string, configurationSet: string, now: Date): Promise<SendResult | { ok: true }> {
  const steps: [string, object][] = [
    ['/v2/email/tenants', { TenantName: name }],
    ['/v2/email/tenants/resources', { TenantName: name, ResourceArn: arn('identity', identity) }],
    ['/v2/email/tenants/resources', { TenantName: name, ResourceArn: arn('configuration-set', configurationSet) }],
  ]
  for (const [path, body] of steps) {
    try {
      const r = await call(path, body, now)
      if (r.ok || r.type === 'AlreadyExistsException' || r.status === 409) continue
      if (r.status === 0) return { ok: false, retry: false, code: 'not_configured' }
      return { ok: false, retry: r.status === 429 || r.status >= 500, code: `ses_${r.type || r.status}`.slice(0, 48) }
    } catch {
      return { ok: false, retry: true, code: 'ses_network' }
    }
  }
  return { ok: true }
}
