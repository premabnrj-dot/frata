import 'server-only'
import { randomUUID } from 'node:crypto'
import { cleanMobile } from '@/domains/checkout/mobile'
import { NOTICE_VERSION } from '@/domains/ekcode-core/notice'
import { retryOnce } from '@/domains/ekcode-core/flow'
import { EKCODE_WA_AUTH_TEMPLATE, EKCODE_WA_PHONE_NUMBER_ID, EKCODE_WA_TEMPLATE_LANG, EKCODE_WA_TOKEN } from '@/lib/env'
import { sendAuthCode } from '@/lib/meta/graph'
import * as vault from '@/lib/db/ekcode'
import { codeKeys, ekOpen, ekSeal, networkBuckets, networkKeys, newCode, phoneKeys, randomToken, tokenDigest } from './keys'
import { powChallenge, powSolved, type PowAnswer, type PowChallenge } from './pow'
import type { FlowCookie } from './flow-cookie'
import { scheme } from './cookie-name'

// =============================================================================
// FILE: src/lib/ekcode/signin.ts — THE STEPS ON EKCODE.IN (P1 task 7): send a code, check it arrived, verify it,
// create the account, continue to the shop. Every step takes its flow, code and proof from the sealed cookie, never
// from a body. Never logs a number, a code, a proof or a name.
// =============================================================================

const masked = (mobile: string) => `+91 ${mobile.slice(0, 5)} •••${mobile.slice(-2)}`

export type SendReply =
  | { ok: true; cookie: FlowCookie }
  | { ok: false; reason: 'invalid' | 'expired' | 'wait' | 'blocked' | 'capped' | 'off'; until?: string }
  | { ok: false; reason: 'pow'; challenge: PowChallenge }

/** Issues and sends a code to the typed number. The same answer whether or not the number has an EkCode. */
export async function sendCode(flow: FlowCookie, typed: string, net: string, pow: PowAnswer | null): Promise<SendReply> {
  const mobile = cleanMobile(typed)
  if (!mobile) return { ok: false, reason: 'invalid' }
  const handleDigest = tokenDigest(flow.h)
  const buckets = networkBuckets(net)
  const narrow = networkKeys(buckets.narrow).write, wide = networkKeys(buckets.wide).write
  const solved = await powSolved(pow, buckets.narrow, handleDigest)
  const codeId = randomUUID()
  const code = newCode()
  const v = await vault.issueCode(handleDigest, phoneKeys(mobile).lookup, codeId, codeKeys(codeId, code).write, narrow, wide, solved)
  if (v.verdict === 'pow') return { ok: false, reason: 'pow', challenge: powChallenge(v.pow_bits, buckets.narrow, handleDigest) }
  if (v.verdict !== 'ok') return { ok: false, reason: v.verdict, ...(v.until ? { until: new Date(v.until).toISOString() } : {}) }
  // The attempt row is committed (ADR-0008); now the call.
  const send = () => sendAuthCode(EKCODE_WA_TOKEN, EKCODE_WA_PHONE_NUMBER_ID, `91${mobile}`, EKCODE_WA_AUTH_TEMPLATE, EKCODE_WA_TEMPLATE_LANG, code, 600)
  let r = await send()
  if (!r.ok && retryOnce(r.error)) { await new Promise((ok) => setTimeout(ok, 2_000)); r = await send() }
  if (r.ok) await vault.markSent(codeId, r.wamid)
  else if (r.error !== null) await vault.markFailed(codeId, r.error)
  // No answer at all: the outcome is unknown; the row stays open and the screen offers Resend (flow.ts code_pending).
  return { ok: true, cookie: { h: flow.h, c: codeId, m: mobile } }
}

export async function codeArrived(flow: FlowCookie) {
  if (!flow.c) return null
  return vault.codeStatus(tokenDigest(flow.h), flow.c)
}

export type View = { hasAccount: boolean; name: string | null; phone: string; addresses: { id: string; label: string }[] }

/** Checks a typed code. On success the cookie gains the proof and the account (if any) is shown. */
export async function verify(flow: FlowCookie, typed: string): Promise<{ ok: true; cookie: FlowCookie; view: View } | { ok: false; triesLeft: number }> {
  if (!flow.c || !flow.m || !/^\d{6}$/.test(typed)) return { ok: false, triesLeft: 0 }
  const proof = randomToken()
  const r = await vault.verifyCode(tokenDigest(flow.h), flow.c, codeKeys(flow.c, typed).lookup, tokenDigest(proof))
  if (!r.ok) return { ok: false, triesLeft: r.tries_left }
  const name = r.has_account && r.seal_ref && r.name_sealed ? ekOpen(r.name_sealed, `ekcode_accounts:name:${r.seal_ref}`) : null
  return { ok: true, cookie: { ...flow, p: proof }, view: { hasAccount: r.has_account, name, phone: masked(flow.m), addresses: r.addresses ?? [] } }
}

/** Creates the EkCode after the notice's own tap. */
export async function create(flow: FlowCookie, typedName: string): Promise<View | null> {
  const name = String(typedName ?? '').trim().replace(/\s+/g, ' ')
  if (!flow.p || !flow.m || name.length < 2 || name.length > 80) return null
  const sealRef = randomUUID()
  const ok = await vault.createAccount(tokenDigest(flow.h), tokenDigest(flow.p), sealRef,
    ekSeal(flow.m, `ekcode_accounts:phone:${sealRef}`), ekSeal(name, `ekcode_accounts:name:${sealRef}`), NOTICE_VERSION)
  return ok ? { hasAccount: true, name, phone: masked(flow.m), addresses: [] } : null
}

/** Continue to the shop: the 60-second grant, and the return address built from the flow row (never a request). */
export async function continueToShop(flow: FlowCookie, addressId: string | null): Promise<string | null> {
  if (!flow.p) return null
  if (addressId !== null && !/^[0-9a-f-]{36}$/.test(addressId)) return null
  const code = randomToken()
  const g = await vault.grant(tokenDigest(flow.h), tokenDigest(flow.p), addressId, tokenDigest(code))
  if (!g) return null
  const u = new URL(`${scheme()}://${g.host}/api/shop/ekcode/return`)
  u.searchParams.set('code', code)
  u.searchParams.set('state', g.state)
  return u.toString()
}
