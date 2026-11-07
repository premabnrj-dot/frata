// =============================================================================
// FILE: e2e/run.mjs — `npm run e2e [-- --only checkout,orders] [--no-build]`
//
// Boots the stack (e2e/stack.mjs), runs each flow in e2e/flows/ in a fresh
// Chromium, prints one line per step, writes screenshots and logs to
// e2e/.out/, and exits non-zero if any step failed. A failed step ends its
// flow (later steps depend on it); the other flows still run.
// =============================================================================
import { readdirSync } from 'node:fs'
import { OUT, SHOP_DOMAIN, PORTS, playwright } from './lib.mjs'
const { chromium } = playwright
import { down, up } from './stack.mjs'

const arg = (k) => process.argv.find((a) => a.startsWith(k))
const only = arg('--only')?.split('=')[1]?.split(',') ?? (process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null)
const files = readdirSync(new URL('./flows/', import.meta.url)).filter((f) => f.endsWith('.mjs')).sort()
  .filter((f) => !only || only.includes(f.replace(/^\d+-/, '').replace('.mjs', '')))

let failed = 0, passed = 0, stack
try {
  stack = await up({ build: !process.argv.includes('--no-build') })
  for (const f of files) {
    const flow = (await import(`./flows/${f}`)).default
    const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP *.${SHOP_DOMAIN} 127.0.0.1:${PORTS.app}`] })
    const errors = []
    const t = {
      db: stack.db, browser, out: (name) => `${OUT}${f.replace('.mjs', '')}-${name}.png`, errors,
      async step(name, fn) {
        let r
        try { r = await fn() } catch (e) { e.step = name; throw e }
        passed++; console.log(`ok   ${flow.name} › ${name}${r ? `  (${r})` : ''}`)
      },
    }
    try { await flow.run(t) } catch (e) {
      failed++; console.log(`FAIL ${flow.name} › ${e.step ?? ''} ${String(e.message).split('\n')[0]}`)
      // What every open page showed at the failure, so the report says what happened, not only that it timed out.
      let n = 0
      for (const ctx of browser.contexts()) for (const page of ctx.pages()) {
        const path = t.out(`FAILED-${++n}`)
        await page.screenshot({ path, fullPage: true }).catch(() => {})
        console.log(`     page ${n}: ${page.url()} → ${path.replace(OUT, 'e2e/.out/')}`)
      }
    }
    if (errors.length) { failed++; console.log(`FAIL ${flow.name} › page errors: ${errors.slice(0, 3).join(' | ')}`) }
    await browser.close()
  }
} catch (e) { failed++; console.log('FAIL stack', e.message) } finally { await down(stack?.db) }
console.log(`\n${failed ? 'RED' : 'GREEN'} — ${passed} steps passed, ${failed} failed. Screenshots and logs: e2e/.out/`)
process.exit(failed ? 1 : 0)
