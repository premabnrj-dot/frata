// =============================================================================
// FLOW: speed — themes:speed (search and sharing S2·8). Lighthouse on the shop as a phone sees it: Home, a
// collection and a product, each the median of 3 runs, against the budgets the themes plan promised: performance
// ≥ 90, accessibility ≥ 95, SEO ≥ 95, layout shift ≤ 0.05. The shop wears whatever look the earlier flows left
// published (flows 47/48 try every theme and put the old one back). Lighthouse is pinned in devDependencies.
// =============================================================================
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { PORTS, SHOP, SHOP_DOMAIN } from '../lib.mjs'

const BUDGET = { performance: 90, accessibility: 95, seo: 95, cls: 0.05 }
const PAGES = [['home', '/'], ['collection', '/collections/kurtas'], ['product', '/products/chanderi-kurta-set']]
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

export default {
  name: 'speed',
  async run(t) {
    const { default: lighthouse } = await import('lighthouse')
    const { launch } = await import('chrome-launcher')
    const chromePath = createRequire(import.meta.url)('playwright').chromium.executablePath()
    const chrome = await launch({ chromePath, chromeFlags: ['--headless=new', '--no-sandbox', `--host-resolver-rules=MAP *.${SHOP_DOMAIN} 127.0.0.1:${PORTS.app}`] })
    const rows = []
    try {
      for (const [name, path] of PAGES) {
        await t.step(`${name}: Lighthouse on a phone, median of 3, within the budgets`, async () => {
          const runs = []
          for (let i = 0; i < 3; i++) {
            const r = await lighthouse(SHOP + path, { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'seo'] })
            const c = r.lhr.categories
            runs.push({ performance: Math.round(c.performance.score * 100), accessibility: Math.round(c.accessibility.score * 100), seo: Math.round(c.seo.score * 100), cls: r.lhr.audits['cumulative-layout-shift'].numericValue,
              shifts: (r.lhr.audits['layout-shifts']?.details?.items ?? []).slice(0, 3).map((x) => `${x.node?.selector ?? '?'} ${Number(x.score ?? 0).toFixed(3)}`),
              failing: Object.values(r.lhr.audits).filter((a) => a.score !== null && a.score < 1 && ['accessibility', 'seo'].some((k) => c[k].auditRefs.some((x) => x.id === a.id && x.weight > 0))).map((a) => a.id) })
          }
          const m = { performance: median(runs.map((r) => r.performance)), accessibility: median(runs.map((r) => r.accessibility)), seo: median(runs.map((r) => r.seo)), cls: median(runs.map((r) => r.cls)) }
          rows.push({ name, ...m, failing: [...new Set(runs.flatMap((r) => r.failing))] })
          console.log(`     speed › ${name}: perf ${m.performance}, a11y ${m.accessibility}, SEO ${m.seo}, CLS ${m.cls.toFixed(3)}`)
          assert.ok(m.accessibility >= BUDGET.accessibility, `${name} accessibility ${m.accessibility} (failing: ${rows.at(-1).failing.join(', ')})`)
          assert.ok(m.seo >= BUDGET.seo, `${name} SEO ${m.seo} (failing: ${rows.at(-1).failing.join(', ')})`)
          assert.ok(m.cls <= BUDGET.cls, `${name} layout shift ${m.cls.toFixed(3)} (moved: ${[...new Set(runs.flatMap((r) => r.shifts))].join('; ')})`)
          assert.ok(m.performance >= BUDGET.performance, `${name} performance ${m.performance}`)
        })
      }
    } finally {
      writeFileSync(t.out('lighthouse').replace(/\.png$/, '.json'), JSON.stringify(rows, null, 2))
      await chrome.kill()
    }
  },
}
