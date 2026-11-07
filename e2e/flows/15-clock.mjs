// =============================================================================
// FLOW: clock — what a page derives from "now" reads the same on the server and
// in the browser (src/components/time/now.tsx, check:clock). The product editor
// once read the browser's clock at hydration: a drop scheduled between the two
// "now"s said "page not found until it goes live" on the server and "Shoppers can
// find it" in the browser, and React threw #418. A browser clock 2 hours ahead
// makes that certain instead of a minute-boundary flake.
// =============================================================================
import assert from 'node:assert/strict'
import { CONSOLE, signedIn } from '../lib.mjs'

export default {
  name: 'clock',
  async run(t) {
    const { db } = t
    await db`update products set status = 'active', publish_at = now() + interval '1 hour' where handle = 'secret-draft'`
    try {
      await t.step('a scheduled drop reads the same in the browser as on the server', async () => {
        const ctx = await signedIn(t.browser, 'owner')
        const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message))
        await p.clock.install({ time: Date.now() + 2 * 60 * 60_000 })
        await p.goto(CONSOLE + '/console/products/secret-draft')
        await p.getByText('Shoppers get "page not found" until it goes live.').waitFor()
        await p.waitForLoadState('networkidle')
        assert.deepEqual(errs, [], `page errors: ${errs.join(' | ')}`)
        await ctx.close()
      })
    } finally {
      await db`update products set status = 'draft', publish_at = null where handle = 'secret-draft'`
    }
  },
}
