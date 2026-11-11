// =============================================================================
// FILE: e2e/run.mjs — `npm run e2e [-- --only checkout,orders] [--no-build]`
//
// Boots the stack (e2e/stack.mjs), runs each flow in e2e/flows/ in a fresh
// Chromium, prints one line per step, writes screenshots and logs to
// e2e/.out/, and exits non-zero if any step failed. A failed step ends its
// flow (later steps depend on it); the other flows still run.
// =============================================================================
import { readdirSync, writeFileSync } from 'node:fs'
import { OUT, SHOP_DOMAIN, PORTS, playwright } from './lib.mjs'
import { EKCODE, OWN_DOMAIN } from './constants.mjs'
const { chromium } = playwright
import { down, up } from './stack.mjs'

const arg = (k) => process.argv.find((a) => a.startsWith(k))
const only = arg('--only')?.split('=')[1]?.split(',') ?? (process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null)
const files = readdirSync(new URL('./flows/', import.meta.url)).filter((f) => f.endsWith('.mjs')).sort()
  .filter((f) => !only || only.includes(f.replace(/^\d+-/, '').replace('.mjs', '')) || only.includes(f.replace('.mjs', '')))
// A filter that matches no flow is an error, never a green run of nothing.
if (only && files.length === 0) { console.error(`--only ${only.join(',')} matches no flow in e2e/flows`); process.exit(1) }

let failed = 0, passed = 0, stack
try {
  stack = await up({ build: !process.argv.includes('--no-build') })
  for (const f of files) {
    const flow = (await import(`./flows/${f}`)).default
    const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP *.${SHOP_DOMAIN} 127.0.0.1:${PORTS.app}, MAP ${OWN_DOMAIN} 127.0.0.1:${PORTS.app}, MAP www.${OWN_DOMAIN} 127.0.0.1:${PORTS.app}, MAP ${EKCODE.host} 127.0.0.1:${PORTS.app}`] })
    // Screenshots are taken with reduced motion unless a flow asks otherwise: a dialog caught half faded in told
    // nothing (motion system 2026-11-08). A flow that tests motion passes reducedMotion: 'no-preference'.
    const newContext = browser.newContext.bind(browser)
    browser.newContext = (o = {}) => newContext({ reducedMotion: 'reduce', ...o })
    const errors = []
    const t = {
      db: stack.db, adb: stack.adb, browser, out: (name) => `${OUT}${f.replace('.mjs', '')}-${name}.png`, errors,
      async step(name, fn) {
        let r
        try { r = await fn() } catch (e) { e.step = name; throw e }
        passed++; console.log(`ok   ${flow.name} › ${name}${r ? `  (${r})` : ''}`)
      },
    }
    try { await flow.run(t) } catch (e) {
      failed++; console.log(`FAIL ${flow.name} › ${e.step ?? ''} ${String(e.message).split('\n')[0]}`)
      // An assertion's values (actual vs expected) say what happened; a bare first line does not.
      if (e.actual !== undefined || e.expected !== undefined) console.log(`     got ${JSON.stringify(e.actual)} · wanted ${JSON.stringify(e.expected)}`)
      // The whole message (Playwright's call log says why a click waited: disabled, covered, moving), beside the shots.
      writeFileSync(`${OUT}${f.replace('.mjs', '')}-FAILED.txt`, `${e.step ?? ''}\n${e.stack ?? e.message}\n`)
      console.log(`     full error: e2e/.out/${f.replace('.mjs', '')}-FAILED.txt`)
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
} catch (e) { failed++; console.log('FAIL stack', e.message) } finally { await down(stack?.db, stack?.adb) }
console.log(`\n${failed ? 'RED' : 'GREEN'} — ${passed} steps passed, ${failed} failed. Screenshots and logs: e2e/.out/`)
process.exit(failed ? 1 : 0)
