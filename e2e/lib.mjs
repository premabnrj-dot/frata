// =============================================================================
// FILE: e2e/lib.mjs
//
// What every end-to-end flow shares: the addresses of the local stack, the
// people a flow can sign in as, a database handle for assertions, and the
// stand-in for Razorpay's checkout.js. Test-only; nothing here is deployed.
// =============================================================================
import { createRequire } from 'node:module'
import postgres from 'postgres'

/** Playwright as installed on the machine (cloud sessions pre-install it; CI installs it): not a dependency of the app. */
export const playwright = createRequire(import.meta.url)('playwright')

export * from './constants.mjs'
import { PORTS, RZP, USERS } from './constants.mjs'

/** Superuser connection to the THROWAWAY database, for setting up and asserting. */
export const adminSql = (url) => postgres(url, { max: 2, onnotice: () => {} })

/** A browser context signed in as `who` on the console host (Supabase's cookie, fake auth answers). */
export async function signedIn(browser, who = 'owner', opts = {}) {
  const ctx = await browser.newContext(opts)
  const u = USERS[who]
  const session = { access_token: who, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: u.id, email: u.email, aud: 'authenticated' } }
  await ctx.addCookies([{ name: 'sb-localhost-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), domain: 'localhost', path: '/' }])
  return ctx
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
