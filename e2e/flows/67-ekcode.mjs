// =============================================================================
// FLOW: EkCode P1 (docs/plans/2026-11-09-ekcode-p1.md § Regression net). A shopper at Kesar Studio's checkout taps
// "Continue with EkCode", lands on ekcode.in, proves their WhatsApp number with a code (the fake Meta keeps it),
// creates an EkCode, continues back and is filled in; "Not you?" signs out; a second sign-in skips Create; five wrong
// codes lock; a forged return, another host's EkCode paths and the shop paths on EkCode's host are refused.
// =============================================================================
import assert from 'node:assert/strict'
import http from 'node:http'
import { CONSOLE, EKCODE, PORTS, SHOP, signedIn, until } from '../lib.mjs'

const EK = `http://${EKCODE.host}`
const PHONE = '9811122233', PHONE2 = '9811122244'
// A visitor id that lands in the shown arm (src/domains/ekcode-core/holdout.ts: FNV-1a % 10 !== 0).
function fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h }
const SHOWN = Array.from({ length: 50 }, (_, i) => `e2e${String(i).padStart(19, '0')}`).find((id) => fnv(`ekcode-holdout-v1:${id}`) % 10 !== 0)
const codeFor = async (phone) => (await (await fetch(`http://localhost:${PORTS.meta}/_test/code?to=91${phone}`)).json()).code

export default {
  name: 'ekcode',
  async run(t) {
    const { db } = t
    const [shop] = await db`select id, name from tenants where slug = 'kesar-studio'`
    const [owner] = await db`select user_id from members where tenant_id = ${shop.id} and role = 'owner' limit 1`
    // A clean vault for the test phones (the e2e database is throwaway), and EkCode switched on for the shop.
    await db`delete from ekcode_accounts`; await db`delete from ekcode_flows`; await db`delete from shop_customers where tenant_id = ${shop.id}`
    await db`delete from rate_limits where key is not null`
    await db`insert into tenant_modules (tenant_id, module, enabled_by) select ${shop.id}, 'ekcode', ${owner.user_id} where not exists (select 1 from tenant_modules where tenant_id = ${shop.id} and module = 'ekcode' and disabled_at is null)`

    const ctx = await t.browser.newContext({ viewport: { width: 390, height: 844 } })
    await ctx.addInitScript((id) => { try { localStorage.setItem('ek_v', id) } catch { /* */ } }, SHOWN)
    const p = await ctx.newPage(); p.setDefaultTimeout(30_000); p.on('pageerror', (e) => t.errors.push(e.message))
    const toCheckout = async () => {
      await p.goto(SHOP + '/products/chanderi-kurta-set', { waitUntil: 'domcontentloaded' })
      // Any colour and size still in stock on the (cached) page: flows before this one buy the same kurta.
      for (const colour of [/^Rust/, /^Indigo/]) {
        await p.getByRole('button', { name: colour }).click()
        const size = p.getByRole('button', { name: /^[SM]$/ })
        if (await size.count()) { await size.first().click(); break }
      }
      await p.getByRole('button', { name: /Add to bag|Pre-order/ }).click(); await p.getByRole('dialog', { name: 'Your bag' }).waitFor()
      await p.getByRole('button', { name: 'Checkout' }).click(); await p.waitForURL(/\/checkout/)
    }
    const signIn = async (phone) => {
      await p.getByRole('link', { name: /Continue with/ }).click()
      await p.waitForURL(`${EK}/continue`)
      await p.getByText(shop.name).first().waitFor()
      await p.getByLabel('Your WhatsApp number').fill(phone)
      await p.getByRole('button', { name: 'Send code on WhatsApp' }).click()
      await p.getByRole('heading', { name: 'Enter the code' }).waitFor({ timeout: 45_000 }) // a proof of work may run first
      const code = await codeFor(phone)
      assert.match(String(code), /^\d{6}$/, 'the fake Meta received a six-digit code')
      await p.getByLabel('Enter the code').fill(code)
    }

    try {
      await t.step('a new shopper: phone → code → Create → Continue → filled in at the shop', async () => {
        // The checkout page is cached for 60 s: read its HTML until it carries EkCode's button, then check out.
        const html = () => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORTS.app, path: '/checkout', headers: { host: new URL(SHOP).host } }, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res(b)) }).on('error', rej))
        await until(async () => (await html()).includes('/api/shop/ekcode/start'), 90_000)
        await toCheckout()
        await p.getByRole('link', { name: /Continue with/ }).waitFor()
        await p.screenshot({ path: t.out('button'), fullPage: true })
        await signIn(PHONE)
        await p.getByRole('heading', { name: 'Create your EkCode' }).waitFor()
        await p.screenshot({ path: t.out('create') })
        await p.getByLabel('Your name').fill('Ananya Rao')
        await p.getByRole('button', { name: 'Create my EkCode' }).click()
        await p.getByRole('heading', { name: `Continue to ${shop.name}` }).waitFor()
        await p.screenshot({ path: t.out('confirm') })
        await p.getByRole('button', { name: 'Continue', exact: true }).click()
        await p.waitForURL(/\/checkout#ek$/)
        await p.getByText('Ananya Rao').waitFor()
        assert.equal(await p.inputValue('#phone'), PHONE, 'the phone is filled')
        assert.equal(await p.inputValue('#name'), 'Ananya Rao', 'the name is filled')
        await p.screenshot({ path: t.out('filled'), fullPage: true })
        const [c] = await db`select phone, pairwise from shop_customers where tenant_id = ${shop.id} and phone = ${PHONE}`
        assert.ok(c?.pairwise, 'the shop holds a pairwise id, never an account id')
      })

      await t.step('a COD order from the signed-in shopper: linked to the customer, the arm kept, the new address saved to EkCode', async () => {
        await p.fill('#pincode', '302001'); await p.fill('#city', 'Jaipur')
        await p.fill('#addressLine', 'B-14, Tilak Marg'); await p.fill('#area', 'C-Scheme'); await p.selectOption('#state', 'Rajasthan')
        await p.getByLabel(/Save this address to/).waitFor()
        await p.getByText('Pay on delivery', { exact: true }).click()
        await p.getByRole('button', { name: /Place order/ }).click(); await p.waitForURL(/\/orders(#t=|$)/)
        const [o] = await db`select o.customer_id, o.checkout->>'ekcode' as arm, c.phone from orders o left join shop_customers c on c.tenant_id = o.tenant_id and c.id = o.customer_id
          where o.tenant_id = ${shop.id} order by o.placed_at desc limit 1`
        assert.equal(o.phone, PHONE, 'the order is linked to the signed-in shopper (same phone)')
        assert.equal(o.arm, 'shown', "the order keeps the holdout arm it was shown")
        await until(async () => Number((await db`select count(*)::int n from ekcode_addresses`)[0].n) === 1, 10_000)
        await p.goto(SHOP + '/checkout') // back to the bag-less checkout for the next step
        await toCheckout()
      })

      await t.step('"Not you?" signs out; the button is back', async () => {
        await p.getByRole('button', { name: 'Not you?' }).click()
        await p.getByRole('link', { name: /Continue with/ }).waitFor()
      })

      await t.step('the same shopper again: code → Continue, no Create', async () => {
        await signIn(PHONE)
        await p.getByRole('heading', { name: `Continue to ${shop.name}` }).waitFor()
        await p.getByRole('radio', { name: /Home/ }).waitFor() // the address saved with the first order is offered
        await p.getByRole('button', { name: 'Continue', exact: true }).click()
        await p.waitForURL(/\/checkout#ek$/)
        await p.getByText('Ananya Rao').waitFor()
        await until(async () => (await p.inputValue('#addressLine')) === 'B-14, Tilak Marg', 10_000)
        await p.getByRole('button', { name: 'Not you?' }).click()
      })

      await t.step('five wrong codes lock; the guest checkout is offered', async () => {
        await p.getByRole('link', { name: /Continue with/ }).click()
        await p.waitForURL(`${EK}/continue`)
        await p.getByLabel('Your WhatsApp number').fill(PHONE2)
        await p.getByRole('button', { name: 'Send code on WhatsApp' }).click()
        await p.getByRole('heading', { name: 'Enter the code' }).waitFor({ timeout: 45_000 })
        const right = await codeFor(PHONE2)
        const wrong = right === '000000' ? '111111' : '000000'
        for (let i = 0; i < 5; i++) { await p.getByLabel('Enter the code').fill(wrong); if (i < 4) await p.getByText(/Code doesn't match/).waitFor() }
        await p.getByRole('heading', { name: 'Too many tries' }).waitFor()
        await p.getByRole('link', { name: 'Check out as a guest' }).waitFor()
      })

      await t.step('the console: EkCode under Apps (folds away), its page lists the shopper', async () => {
        const ctx2 = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 860 } })
        const q = await ctx2.newPage(); q.setDefaultTimeout(15_000); q.on('pageerror', (e) => t.errors.push(e.message))
        try {
          await q.goto(CONSOLE + '/console')
          const nav = q.getByRole('navigation', { name: 'Console', exact: true })
          await nav.getByRole('link', { name: 'EkCode', exact: true }).waitFor()
          await nav.getByRole('button', { name: 'Hide apps in use' }).click()
          await nav.getByRole('link', { name: 'EkCode', exact: true }).waitFor({ state: 'detached' })
          await nav.getByRole('button', { name: 'Show apps in use' }).click()
          await nav.getByRole('link', { name: 'EkCode', exact: true }).click()
          await q.getByRole('heading', { level: 1, name: 'EkCode' }).waitFor()
          await q.getByText('Sign-ins · 7 days').waitFor()
          await q.screenshot({ path: t.out('console-overview'), fullPage: true })
          await q.getByRole('link', { name: 'Shoppers', exact: true }).click()
          await q.getByText('Ananya Rao').waitFor()
          assert.equal((await q.getByRole('row', { name: /Ananya Rao/ }).getByRole('cell').last().innerText()).trim(), '1', 'her order is counted')
          await q.screenshot({ path: t.out('console-shoppers'), fullPage: true })
        } finally { await ctx2.close() }
      })

      await t.step('refused: a forged return, EkCode paths on a shop, shop paths on EkCode', async () => {
        await p.goto(`${SHOP}/api/shop/ekcode/return?code=${'a'.repeat(43)}&state=${'b'.repeat(43)}`)
        assert.ok(p.url().endsWith('/checkout'), 'a forged return lands on the checkout, signed out')
        for (const path of ['/console', '/api/shop/quote', '/checkout', '/ek/continue']) {
          const x = await p.goto(`${EK}${path}`)
          assert.equal(x?.status(), 404, `${path} is not served on EkCode's host`)
        }
        for (const path of ['/ek', '/ek/continue', '/api/ek/code']) {
          const x = await p.goto(`${SHOP}${path}`)
          assert.equal(x?.status(), 404, `${path} is not served on a shop`)
        }
      })
    } catch (e) {
      // The context closes below, before the runner's own shot of open pages: keep what this page showed.
      await p.screenshot({ path: t.out('at-failure'), fullPage: true }).catch(() => {}); console.log(`     at failure: ${p.url()}`)
      throw e
    } finally {
      await ctx.close()
    }
  },
}
