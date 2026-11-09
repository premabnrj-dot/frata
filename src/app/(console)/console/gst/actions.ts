'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { CAN_SEE_GST } from '@/domains/tenancy/roles'
import { compareLiability, liabilityOf, OTP_SHAPE, stepOf, USERNAME_SHAPE, type Liability } from '@/domains/tax/gsp'
import { hsnEntry } from '@/domains/tax/rates'
import { gstr1Json } from '@/domains/tax/gstr1-files'
import { asMember } from '@/lib/auth/as-member'
import { open, seal } from '@/lib/crypto/secret-box'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { shopSettings } from '@/lib/db/schema'
import { gstAttempts, gstConnections, gstFilings } from '@/lib/db/schema-gst'
import type { Tx } from '@/lib/db'
import { gstPeriodIn } from '@/lib/queries/gst'
import { errName } from '@/lib/log'
import { gsp, GSP_ERROR_WORDS, type GspError } from '@/lib/gst/gsp'

// =============================================================================
// FILE: src/app/(console)/console/gst/actions.ts — FILING A PERIOD FROM FRRATA (GST app G2). Connect (portal OTP) → push (save the
// GSTR-1 and read the portal's summary back) → file (EVC OTP; final; the ARN kept). Each call is an attempt row
// committed BEFORE the request and closed after it (ADR-0006 as draft ADR-0008 reads it for interactive calls: an
// OTP can't wait in an outbox). Owner, admin or the accountant; never a Frrata support visit (filing is the
// taxpayer's act). Off unless gsp() gives a GSP. Nothing here logs a session, an OTP or the return. Every input
// arrives as unknown and is cut to a short string first.
// =============================================================================

type Fail = { ok: false; error: string }
type Out<T = object> = ({ ok: true } & T) | Fail
type Started = { ok: true; attempt: string; tenantId: string; userId: string; prep: Record<string, unknown> }
const FIELD = 'gsp_session'
const OFF: Fail = { ok: false, error: 'Filing from Frrata isn’t switched on. Download the files for your CA.' }
const SUPPORT: Fail = { ok: false, error: 'Frrata support can’t file a shop’s return.' }
/** A begin() that didn't start, as its failure; null when it started. */
const failed = (b: { ok: true; value: Started | Fail } | Fail): Fail | null => (!b.ok ? b : !b.value.ok ? b.value : null)

/** Writes the attempt and returns its id, in its own transaction so the row exists before the request. */
async function begin(kind: 'connect' | 'verify' | 'push' | 'file', period: string | null, prep?: (tx: Tx, tenantId: string, userId: string) => Promise<Out<Record<string, unknown>>>) {
  return asMember(CAN_SEE_GST, { action: `gst.${kind}`, detail: { period } }, async (tx, auth): Promise<Started | Fail> => {
    if (auth.membership.supportSessionId) return SUPPORT
    const tenantId = auth.membership.tenantId
    const pre = prep ? await prep(tx, tenantId, auth.userId) : { ok: true as const }
    if (!pre.ok) return { ok: false, error: pre.error }
    const [a] = await tx.insert(gstAttempts).values({ tenantId, kind, period, actor: auth.userId }).returning({ id: gstAttempts.id })
    return { ok: true as const, attempt: a!.id, tenantId, userId: auth.userId, prep: pre as Record<string, unknown> }
  })
}
async function end(attempt: string, error: GspError | 'ours' | null, then?: (tx: Tx, tenantId: string, userId: string) => Promise<void>) {
  return asMember(CAN_SEE_GST, { action: 'gst.attempt_end', target: attempt }, async (tx, auth) => {
    await tx.update(gstAttempts).set({ outcome: error ? 'failed' : 'ok', error, endedAt: new Date() }).where(and(eq(gstAttempts.tenantId, auth.membership.tenantId), eq(gstAttempts.id, attempt)))
    if (!error && then) await then(tx, auth.membership.tenantId, auth.userId)
  })
}
const words = (e: GspError) => GSP_ERROR_WORDS[e]
const str = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v.trim() : '')
const PERIOD = /^\d{4}-(\d{2}|Q[1-4])$/
const NOT_PERIOD: Fail = { ok: false, error: 'That isn’t a GST period.' }
const done = <T extends { ok: boolean }>(r: T) => { if (r.ok) revalidatePath('/console/gst'); return r }
async function call<T>(f: () => Promise<({ ok: true } & T) | { ok: false; error: GspError }>): Promise<({ ok: true } & T) | { ok: false; error: GspError }> {
  try { return await f() } catch (err) { console.error('[gst/gsp]', errName(err)); return { ok: false, error: 'portal_down' } }
}

/** The shop's live session, opened; null when none or expired. */
async function sessionOf(tx: Tx, tenantId: string, gstin: string, now: Date) {
  const [c] = await tx.select().from(gstConnections).where(and(eq(gstConnections.tenantId, tenantId), eq(gstConnections.gstin, gstin)))
  if (c?.tokenEnc && (!c.expiresAt || c.expiresAt <= now)) await tx.update(gstConnections).set({ tokenEnc: null, expiresAt: null }).where(eq(gstConnections.id, c.id))
  if (!c?.tokenEnc || !c.expiresAt || c.expiresAt <= now) return null
  const s = open(c.tokenEnc, tenantId, FIELD)
  return s ? { session: s, username: c.username } : null
}

/** Step 1: the portal texts an OTP. The txn comes back sealed to this shop. */
export async function gstConnect(name: unknown): Promise<Out<{ txn: string }>> {
  const username = str(name, 60)
  const g = gsp()
  if (!g) return OFF
  if (!USERNAME_SHAPE.test(username)) return { ok: false, error: 'Your GST portal username: letters, digits and . _ -' }
  const b = await begin('connect', null, async (tx, tenantId) => {
    if (!(await withinLimit(LIMITS.gstOtpShop, tenantId, new Date(), true))) return { ok: false, error: 'Too many OTPs this hour. Try again later.' }
    const [shop] = await tx.select({ gstin: shopSettings.gstin }).from(shopSettings).where(eq(shopSettings.tenantId, tenantId))
    const gstin = shop?.gstin ?? null
    return gstin ? { ok: true, gstin } : { ok: false, error: 'Add your GSTIN in Settings › Taxes first.' }
  })
  const f = failed(b)
  if (f || !b.ok || !b.value.ok) return f!
  const { attempt, tenantId, prep } = b.value
  const r = await call(() => g.requestOtp(prep.gstin as string, username))
  await end(attempt, r.ok ? null : r.error)
  return r.ok ? { ok: true, txn: seal(`${r.txn}|${username}|${prep.gstin}`, tenantId, 'gsp_txn') } : { ok: false, error: words(r.error) }
}

/** Step 2: the OTP for a session; the connection row keeps it sealed. */
export async function gstVerify(txnIn: unknown, otpIn: unknown): Promise<Out> {
  const txnSealed = str(txnIn, 600), otp = str(otpIn, 6)
  const g = gsp()
  if (!g) return OFF
  if (!OTP_SHAPE.test(otp)) return { ok: false, error: 'The OTP is six digits.' }
  const b = await begin('verify', null, async (_tx, tenantId) => {
    if (!(await withinLimit(LIMITS.gstOtpTry, tenantId, new Date(), true))) return { ok: false, error: 'Too many OTPs tried. Wait 15 minutes.' }
    const t = open(txnSealed, tenantId, 'gsp_txn')?.split('|')
    return t?.length === 3 ? { ok: true, txn: t[0], username: t[1], gstin: t[2] } : { ok: false, error: words('otp_expired') }
  })
  const f = failed(b)
  if (f || !b.ok || !b.value.ok) return f!
  const { attempt, tenantId, prep } = b.value
  const [txn, username, gstin] = [prep.txn as string, prep.username as string, prep.gstin as string]
  const r = await call(() => g.verifyOtp(gstin, username, txn, otp))
  await end(attempt, r.ok ? null : r.error, r.ok ? async (tx, _t, userId) => {
    const row = { username, tokenEnc: seal(r.session, tenantId, FIELD), expiresAt: r.expiresAt, connectedAt: new Date(), connectedBy: userId }
    await tx.insert(gstConnections).values({ tenantId, gstin, ...row }).onConflictDoUpdate({ target: [gstConnections.tenantId, gstConnections.gstin], set: row })
  } : undefined)
  return r.ok ? done({ ok: true }) : { ok: false, error: words(r.error) }
}

/** Forget the session (the portal's own session ends on its clock). */
export async function gstDisconnect(): Promise<Out> {
  const r = await asMember(CAN_SEE_GST, { action: 'gst.disconnect' }, async (tx, auth) => {
    if (auth.membership.supportSessionId) return SUPPORT as Out
    await tx.update(gstConnections).set({ tokenEnc: null, expiresAt: null }).where(eq(gstConnections.tenantId, auth.membership.tenantId))
    return { ok: true as const }
  })
  return r.ok ? done(r.value) : r
}

type Ready = { gstin: string; fp: string; json: unknown; ours: Liability; session: string; filed: boolean; pushed: Liability | null; portal: Liability | null }
/** The period as of now, the session and the filing row: what push and file both start from. */
async function readyFor(tx: Tx, tenantId: string, key: string, now: Date): Promise<Out<Ready>> {
  const d = await gstPeriodIn(tx, tenantId, key, now)
  if (!d || d.period.key !== key) return { ok: false, error: 'That isn’t a period you can file yet.' }
  if (!d.shop.gstin || d.shop.scheme !== 'regular') return { ok: false, error: 'GSTR-1 is for shops on the regular GST scheme.' }
  const s = await sessionOf(tx, tenantId, d.shop.gstin, now)
  if (!s) return { ok: false, error: words('session_expired') }
  const [f] = await tx.select().from(gstFilings).where(and(eq(gstFilings.tenantId, tenantId), eq(gstFilings.gstin, d.shop.gstin), eq(gstFilings.period, key)))
  const json = gstr1Json(d.gstr, d.shop.gstin, d.period.fp, (h) => hsnEntry(h, d.period.from)?.name ?? '')
  return { ok: true, gstin: d.shop.gstin, fp: d.period.fp, json, ours: liabilityOf(d.gstr), session: s.session, filed: !!f?.filedAt,
    pushed: (f?.ours as Liability | undefined) ?? null, portal: (f?.portal as Liability | null | undefined) ?? null }
}

/** Save the period on the portal, then read its summary back and keep both. */
export async function gstPush(period: unknown): Promise<Out<{ differences: number }>> {
  const key = str(period, 7)
  if (!PERIOD.test(key)) return NOT_PERIOD
  const g = gsp()
  if (!g) return OFF
  const now = new Date()
  const b = await begin('push', key, async (tx, tenantId) => {
    const r = await readyFor(tx, tenantId, key, now)
    if (r.ok && r.filed) return { ok: false, error: words('already_filed') }
    return r as Out<Record<string, unknown>>
  })
  const f = failed(b)
  if (f || !b.ok || !b.value.ok) return f!
  const { attempt, tenantId, prep } = b.value
  const p = prep as unknown as Ready
  const saved = await call(() => g.push(p.session, p.gstin, p.fp, p.json))
  const sum = saved.ok ? await call(() => g.summary(p.session, p.gstin, p.fp)) : saved
  const err = !saved.ok ? saved.error : !sum.ok ? sum.error : null
  await end(attempt, err, saved.ok ? async (tx, _t, userId) => {
    const row = { ours: p.ours, portal: sum.ok ? sum.liability : null, pushRef: saved.ref, pushedAt: now, pushedBy: userId }
    await tx.insert(gstFilings).values({ tenantId, gstin: p.gstin, period: key, ...row }).onConflictDoUpdate({ target: [gstFilings.tenantId, gstFilings.gstin, gstFilings.period], set: row })
  } : undefined)
  if (err) return { ok: false, error: words(err) }
  return done({ ok: true as const, differences: sum.ok ? compareLiability(p.ours, sum.liability).length : 0 })
}

/** The EVC OTP to the signatory's mobile, only when the period is ready to file. */
export async function gstFileOtp(period: unknown): Promise<Out> {
  const key = str(period, 7)
  if (!PERIOD.test(key)) return NOT_PERIOD
  const g = gsp()
  if (!g) return OFF
  const b = await begin('file', key, async (tx, tenantId) => {
    if (!(await withinLimit(LIMITS.gstOtpShop, tenantId, new Date(), true))) return { ok: false, error: 'Too many OTPs this hour. Try again later.' }
    return gate(await readyFor(tx, tenantId, key, new Date())) as Out<Record<string, unknown>>
  })
  const f = failed(b)
  if (f || !b.ok || !b.value.ok) return f!
  const p = b.value.prep as unknown as Ready
  const r = await call(() => g.requestFileOtp(p.session, p.gstin, p.fp))
  await end(b.value.attempt, r.ok ? null : r.error)
  return r.ok ? { ok: true } : { ok: false, error: words(r.error) }
}

/** Refuses unless the step is "file": pushed as the documents stand now, and the portal agrees. */
function gate(r: Out<Ready>): Out<Ready> {
  if (!r.ok) return r
  const step = stepOf({ connected: true, filed: r.filed, pushed: r.pushed, now: r.ours, portal: r.portal })
  if (step === 'filed') return { ok: false, error: words('already_filed') }
  if (step === 'push') return { ok: false, error: 'The period changed since you pushed it. Push again first.' }
  if (step === 'check') return { ok: false, error: 'The portal’s totals don’t match ours. Push again, or ask your CA.' }
  return r
}

/** File: final. The ARN is kept on the filing row, which can't change after. */
export async function gstFile(period: unknown, otpIn: unknown): Promise<Out<{ arn: string }>> {
  const key = str(period, 7), otp = str(otpIn, 6)
  if (!PERIOD.test(key)) return NOT_PERIOD
  const g = gsp()
  if (!g) return OFF
  if (!OTP_SHAPE.test(otp)) return { ok: false, error: 'The OTP is six digits.' }
  const b = await begin('file', key, async (tx, tenantId) => {
    if (!(await withinLimit(LIMITS.gstOtpTry, tenantId, new Date(), true))) return { ok: false, error: 'Too many OTPs tried. Wait 15 minutes.' }
    return gate(await readyFor(tx, tenantId, key, new Date())) as Out<Record<string, unknown>>
  })
  const f = failed(b)
  if (f || !b.ok || !b.value.ok) return f!
  const { attempt, tenantId, prep } = b.value
  const p = prep as unknown as Ready
  const r = await call(() => g.file(p.session, p.gstin, p.fp, otp))
  await end(attempt, r.ok ? null : r.error, r.ok ? async (tx, _t, userId) => {
    await tx.update(gstFilings).set({ filedAt: new Date(), filedBy: userId, arn: r.arn }).where(and(eq(gstFilings.tenantId, tenantId), eq(gstFilings.gstin, p.gstin), eq(gstFilings.period, key)))
  } : undefined)
  return r.ok ? done({ ok: true as const, arn: r.arn }) : { ok: false, error: words(r.error) }
}
