// =============================================================================
// FILE: e2e/lib.mjs
//
// What every end-to-end flow shares: the addresses of the local stack, the
// people a flow can sign in as, a database handle for assertions, and the
// stand-in for Razorpay's checkout.js. Test-only; nothing here is deployed.
// =============================================================================
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import postgres from 'postgres'

/** Playwright as installed on the machine (cloud sessions pre-install it; CI installs it): not a dependency of the app. */
export const playwright = createRequire(import.meta.url)('playwright')

export * from './constants.mjs'
import { PORTS, RZP, USERS } from './constants.mjs'

/** Superuser connection to the THROWAWAY database, for setting up and asserting. */
export const adminSql = (url) => postgres(url, { max: 2, onnotice: () => {} })

/** The stack's superuser connection, set by run.mjs, so signedIn can seed a staff passkey step-up. */
let stackDb = null
export const useStackDb = (db) => { stackDb = db }

/**
 * A browser context signed in as `who` on the console host (Supabase's cookie, fake auth answers), with its own
 * Supabase session id. Staff passkeys (2026-11-12): a person on platform_staff gets a passkey step-up for this session
 * written straight into the test database — test seeding, never an app switch — so flows about other things open
 * Admin as before. `passkey: false` leaves it out: 75-staff-passkeys drives the real check with a virtual authenticator.
 */
export async function signedIn(browser, who = 'owner', opts = {}) {
  const { passkey = true, ...ctxOpts } = opts
  const ctx = await browser.newContext(ctxOpts)
  const u = USERS[who]
  const sessionId = randomUUID()
  // JWT-shaped (HS256, so getClaims asks the fake's /user, as it would for a symmetric key); `who` names the person.
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const exp = Math.floor(Date.now() / 1000) + 3600
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: u.id, who, role: 'authenticated', aud: 'authenticated', exp, session_id: sessionId })}.sig`
  const session = { access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: u.id, email: u.email, aud: 'authenticated' } }
  await ctx.addCookies([{ name: 'sb-localhost-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), domain: 'localhost', path: '/' }])
  ctx.frrataSession = sessionId
  if (passkey && stackDb && (await stackDb`select 1 from platform_staff where user_id = ${u.id}`).length) await seedStaffStepup(ctx, who)
  return ctx
}

/** Writes a passkey and a 12-hour step-up for this context's session and sets the cookie (test seeding only). */
export async function seedStaffStepup(ctx, who) {
  const u = USERS[who]
  const credential = `e2e-seed-${u.id}`
  await stackDb`insert into staff_passkeys (user_id, credential_id, public_key, name) values (${u.id}, ${credential}, 'e2e', 'e2e seed') on conflict (credential_id) do nothing`
  const [k] = await stackDb`select id from staff_passkeys where credential_id = ${credential}`
  const token = randomBytes(32).toString('base64url')
  await stackDb`insert into staff_stepups (user_id, session_id, passkey_id, token_hash, expires_at)
    values (${u.id}, ${ctx.frrataSession}, ${k.id}, ${createHash('sha256').update(token).digest('hex')}, now() + interval '12 hours')`
  await ctx.addCookies([{ name: 'frrata_staff', value: token, domain: 'localhost', path: '/' }])
}

/** Razorpay's checkout.js, stood in: "paying" asks the fake API for a captured, signed payment; `window.__rzpMode = 'dismiss'` closes it. */
export const FAKE_CHECKOUT = `window.Razorpay = function (o) { this.o = o; this.h = {}; };
window.Razorpay.prototype.on = function (e, f) { this.h[e] = f };
window.Razorpay.prototype.open = function () { var o = this.o;
  if (window.__rzpMode === 'dismiss') { setTimeout(function () { o.modal && o.modal.ondismiss && o.modal.ondismiss() }, 50); return }
  fetch('${RZP}/_test/pay', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ order_id: o.order_id }) })
    .then(function (r) { return r.json() }).then(function (p) { window.__lastPay = p; o.handler({ razorpay_payment_id: p.payment_id, razorpay_signature: p.signature, razorpay_order_id: o.order_id }) }) };`

export const wait = (ms) => new Promise((r) => setTimeout(r, ms))
/** Poll until `fn` returns truthy (webhooks are processed after the response). */
export async function until(fn, ms = 5000) {
  const end = Date.now() + ms
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('timed out waiting'); await wait(150) }
}

/**
 * A moment `minutes` ago that is still TODAY in India (risk counts "COD orders from this phone today" by the IST
 * calendar day). Just after IST midnight, "50 minutes ago" is yesterday and a flow's three same-day orders split
 * across two days (found by e2e at 00:16 IST, 2026-11-08). Earlier minutes stay earlier; never before midnight.
 */
export function todayAgo(minutes, now = Date.now()) {
  const IST = 5.5 * 3600_000, DAY = 86_400_000
  const midnight = Math.floor((now + IST) / DAY) * DAY - IST
  return new Date(Math.max(now - minutes * 60_000, midnight + (120 - minutes) * 1000))
}

/**
 * The toast on screen (frata-design-language § Feedback): its words, its kind ('ok' | 'error') and, for an error,
 * role="alert". `text` is a string (contained) or a RegExp. Returns the toast's locator.
 */
export async function expectToast(page, text, kind = 'error', { quiet = false, timeout = 10_000 } = {}) {
  const t = page.locator(`[data-toast="${kind}"]`).filter({ hasText: text })
  await t.waitFor({ timeout })
  // An error is an alert; the field summary is quiet (focus is on the field, the count said once politely).
  const role = await t.getAttribute('role')
  if (kind === 'error' && !quiet && role !== 'alert') throw new Error(`error toast "${text}" is not role="alert"`)
  if (quiet && role === 'alert') throw new Error(`field summary "${text}" should not be an alert`)
  return t
}

/**
 * Make `user` a live partner on `tenantId` (partner teams T1a, drizzle/0124): an approved partner with its owner member,
 * an active link to the shop, and the shop row pointing at the member. A partner shop row without its person is refused
 * by the members CHECK, and access counts only while the member, the partner and the link are live.
 */
export async function partnerOn(db, tenantId, user) {
  const [p] = await db`insert into partners (user_id, email, name, business_name, phone, city, services, work_url, brands_now, terms_version, agreed_at, approved_at)
    values (${user.id}, ${user.email}, 'Pia', 'Pia Studio', '919845012345', 'Jaipur', '{}', '', '1-4', 1, now(), now())
    on conflict (user_id) do update set approved_at = coalesce(partners.approved_at, now()), declined_at = null, suspended_at = null returning id`
  let [pm] = await db`select id from partner_members where partner_id = ${p.id} and user_id = ${user.id} and removed_at is null`
  if (!pm) [pm] = await db`insert into partner_members (partner_id, user_id, email, role, accepted_at) values (${p.id}, ${user.id}, ${user.email.toLowerCase()}, 'owner', now()) returning id`
  await db`insert into partner_links (tenant_id, partner_id, share_bps, share_months, notice_days) values (${tenantId}, ${p.id}, 2000, 24, 90) on conflict do nothing`
  await db`insert into members (tenant_id, user_id, role, partner_member_id) values (${tenantId}, ${user.id}, 'partner', ${pm.id})
    on conflict (tenant_id, user_id) do update set role = 'partner', partner_member_id = excluded.partner_member_id`
}
