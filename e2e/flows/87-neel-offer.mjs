// =============================================================================
// FLOW: neel-offer (Neel N2b·2) — the new-offer form as drawn: What kind as cards, The offer, What shoppers see at the
// side (the bar and the bag follow the form), What it costs you only for whoever sees costs, the phone, axe. Saves
// nothing.
// =============================================================================
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { CONSOLE, signedIn } from '../lib.mjs'

const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
const audit = async (p) => {
  await p.addScriptTag({ content: AXE })
  return p.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`))
}

export default {
  name: 'neel-offer',
  async run(t) {
    const owner = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 900 } })
    const p = await owner.newPage(); p.setDefaultTimeout(10_000); p.on('pageerror', (e) => t.errors.push(e.message))
    try {
      await t.step('the form as drawn; the preview follows what is typed', async () => {
        await p.goto(`${CONSOLE}/console/offers/new`)
        await p.getByRole('heading', { name: 'What kind' }).waitFor()
        await p.getByRole('heading', { name: 'The offer' }).waitFor()
        const see = p.getByRole('region', { name: 'Preview' })
        await see.getByText('The bar at the top of the store').count()
        await p.locator('#o-title').fill('Festive N2b')
        await p.locator('#o-value').fill('10')
        await see.getByText(/Festive N2b|10%/).first().waitFor()
        await p.screenshot({ path: 'e2e/.out/87-offer-1280.png', fullPage: true })
        const v = await audit(p); assert.deepEqual(v, [], `axe: ${v.join('; ')}`)
      })
      await t.step('the phone: nothing scrolls sideways', async () => {
        await p.setViewportSize({ width: 390, height: 844 }); await p.reload()
        await p.getByRole('heading', { name: 'What kind' }).waitFor()
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 391), 'nothing scrolls sideways')
        await p.screenshot({ path: 'e2e/.out/87-offer-390.png', fullPage: true })
      })
    } finally { await owner.close() }
  },
}
