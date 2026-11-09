#!/usr/bin/env node
// =============================================================================
// FILE: scripts/check-modules.mjs — `node scripts/check-modules.mjs`
//
// Fails: core code importing a module's own code. A module (src/domains/modules/
// registry.ts, MODULE_KEYS) lives in its own folders:
//   src/domains/<key>/ · src/lib/modules/<key>/ · src/components/modules/<key>/ ·
//   src/app/(console)/console/apps/<key>/
// and core reaches it only through the named hook points below, so adding or
// removing a module never edits core pages (docs/specs/2026-11-07-modules-foundation.md
// § 4). Comment lines are skipped, so this header never trips the gate.
// =============================================================================
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const registry = readFileSync('src/domains/modules/registry.ts', 'utf8')
const KEYS = [...(registry.match(/MODULE_KEYS = \[([^\]]*)\]/)?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
/** The hook points: where core may import a module's code, and why. */
const HOOKS = {
  'src/components/modules/slots.tsx': 'the slot map: which module fills which slot',
  'src/components/modules/storefront.tsx': 'the shop\'s product hook: what a module puts under a product, and its rating',
  'src/lib/outbox/drain.ts': 'the SENDERS map: a module registers its outbox senders (the cron route only drains)',
  'src/app/api/cron/outbox/route.ts': 'the daily run: it drains the outbox and runs each module\'s sweep',
  'src/app/(console)/console/layout.tsx': 'the nav builder: a usable module adds its nav item',
}
const HOOK_DIRS = [['src/app/api/webhooks/', 'a module\'s inbound webhook route']]
// A module's own shopper routes too: its API under api/shop/<key>/ and its pages in the shop's (<key>) route group.
// A module may use the modules it depends on (registry dependsOn: Reviews sends through Communication), never others.
const DEPENDS = Object.fromEntries([...registry.matchAll(/key: '([a-z_]+)'[^\n]*?dependsOn: \[([^\]]*)\]/g)].map((m) => [m[1], [...m[2].matchAll(/'([a-z_]+)'/g)].map((d) => d[1])]))
const owned = (key) => [`src/domains/${key}/`, `src/lib/modules/${key}/`, `src/components/modules/${key}/`, `src/app/(console)/console/apps/${key}/`, `src/app/api/shop/${key}/`, `src/app/s/[host]/(${key})/`]

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n).replaceAll('\\', '/')
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) && !p.includes('/__tests__/') ? [p] : []
})
const failures = []
for (const file of walk('src')) {
  if (HOOKS[file] || HOOK_DIRS.some(([d]) => file.startsWith(d))) continue
  const code = readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n')
  const mine = KEYS.find((k) => owned(k).some((p) => file.startsWith(p)))
  for (const key of KEYS) {
    if (owned(key).some((p) => file.startsWith(p))) continue
    if (mine && DEPENDS[mine]?.includes(key)) continue
    const re = new RegExp(`from\\s+['"]@/(domains/${key}|lib/modules/${key}|components/modules/${key}|app/\\(console\\)/console/apps/${key})(/|['"])`)
    if (re.test(code)) failures.push(`${file}  imports module "${key}" directly — reach it through a slot, the nav or the sender registry (scripts/check-modules.mjs HOOKS)`)
  }
}
if (failures.length) {
  for (const f of failures) console.error(f)
  console.error(`check:modules — ${failures.length} problem(s)`)
  process.exit(1)
}
console.log(`check:modules — clean (${KEYS.length} modules)`)
