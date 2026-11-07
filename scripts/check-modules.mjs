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
  'src/app/api/cron/outbox/route.ts': 'the sender registry: a module registers its outbox senders',
  'src/app/(console)/console/layout.tsx': 'the nav builder: a usable module adds its nav item',
}
const HOOK_DIRS = [['src/app/api/webhooks/', 'a module\'s inbound webhook route']]
const owned = (key) => [`src/domains/${key}/`, `src/lib/modules/${key}/`, `src/components/modules/${key}/`, `src/app/(console)/console/apps/${key}/`]

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n).replaceAll('\\', '/')
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) && !p.includes('/__tests__/') ? [p] : []
})
const failures = []
for (const file of walk('src')) {
  if (HOOKS[file] || HOOK_DIRS.some(([d]) => file.startsWith(d))) continue
  const code = readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n')
  for (const key of KEYS) {
    if (owned(key).some((p) => file.startsWith(p))) continue
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
