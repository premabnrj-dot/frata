#!/usr/bin/env node
// =============================================================================
// FILE: scripts/check-capabilities.mjs — `node scripts/check-capabilities.mjs`
//
// ADR-0015 guardrails that a grep can hold (T1c, plan docs/plans/2026-11-15-t1c-builders.md § Tasks 5). A partner's
// Builder never sees orders, shoppers or costs; these keep the code shaped so it can't:
//   doors      requireCapability( only in the files of scripts/builder-doors.json (and its own module, tests)
//   actor      the Actor's maker (builderActor) only in require-capability.ts; the one unwrap (previewTenantOf) only in
//              the console preview page; @/lib/db/actor imported only by the door, builder queries, doors and _builder files
//   builder    a file under a _builder/ folder imports (types aside) from @/lib/queries only builder, from @/lib/db only actor
//   asserts    every export of src/lib/queries/builder.ts opens its transaction through withActor( (which asserts the
//              capability first)
//   role-list  an array naming 'builder' beside a member role, outside roles.ts (and team.ts: the PARTNER's roles)
//   set-role   SET ROLE, RESET ROLE or set_config('role' in src (a Builder connects as its own login, never switches)
//   role-eq    a member-role === / !== outside the files frozen in ROLE_EQ (a ratchet: a new one is a capability)
// Comment lines are skipped, so this header never trips the gate.
// =============================================================================
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const DOORS = new Set(JSON.parse(readFileSync(join(ROOT, 'scripts/builder-doors.json'), 'utf8')).files)
/** Files that compared a member role by hand when T1c arrived (2026-11-15). Admin's compare staff roles. */
const ROLE_EQ = new Set([
  'src/app/(admin)/admin/merchants/[id]/page.tsx', 'src/app/(admin)/admin/merchants/[id]/support/page.tsx', 'src/app/(admin)/admin/partners/page.tsx',
  'src/app/(admin)/admin/plans/page.tsx', 'src/app/(admin)/admin/staff/page.tsx', 'src/app/(console)/console/apps/delivery_zones/page.tsx',
  'src/app/(console)/console/apps/gst/page.tsx', 'src/app/(console)/console/settings/notifications/page.tsx', 'src/app/(console)/console/settings/page.tsx',
  'src/app/(console)/console/settings/people/page.tsx', 'src/app/(partner)/partner/(workspace)/team/page.tsx', 'src/app/choose/page.tsx',
  'src/app/start/page.tsx', 'src/components/passkeys/partner-gate.tsx', 'src/domains/communication/roles.ts', 'src/lib/admin/merchants.ts',
  'src/lib/admin/partner-passkeys.ts', 'src/lib/db/platform.ts', 'src/lib/email/notice-sender.ts', 'src/domains/tenancy/roles.ts',
  'src/app/(console)/console/layout.tsx', 'src/app/(console)/console/apps/true_profit/page.tsx', 'src/lib/queries/settings.ts',
])
const ACTOR_IMPORTERS = new Set(['src/lib/auth/require-capability.ts', 'src/lib/queries/builder.ts', ...DOORS])

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) { if (name !== 'node_modules' && name !== '__tests__') walk(p, out) }
    else if (/\.(ts|tsx|mjs)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}
const code = (text) => text.split('\n').map((l) => (/^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l.replace(/\s\/\/.*$/, ''))).join('\n')

const failures = []
for (const abs of walk(join(ROOT, 'src'))) {
  const file = relative(ROOT, abs).split('\\').join('/')
  const text = code(readFileSync(abs, 'utf8'))
  const builderFile = file.includes('/_builder/')
  if (/\brequireCapability\(/.test(text) && !DOORS.has(file) && file !== 'src/lib/auth/require-capability.ts') {
    failures.push(`${file}  doors: requireCapability( outside scripts/builder-doors.json — a new Builder door is a plan change, and the e2e sweep reads that list`)
  }
  if (/\bbuilderActor\(/.test(text) && !['src/lib/db/actor.ts', 'src/lib/auth/require-capability.ts'].includes(file)) failures.push(`${file}  actor: builderActor( outside require-capability.ts`)
  if (/\bpreviewTenantOf\(/.test(text) && !['src/lib/db/actor.ts', 'src/app/(console)/console/preview/[[...path]]/page.tsx'].includes(file)) failures.push(`${file}  actor: previewTenantOf( outside the console preview page`)
  if (/from\s+['"]@\/lib\/db\/actor['"]/.test(text) && !ACTOR_IMPORTERS.has(file) && !builderFile) failures.push(`${file}  actor: imports @/lib/db/actor`)
  if (builderFile) {
    for (const m of text.matchAll(/^import\s+(type\s+)?[\s\S]*?from\s+['"]([^'"]+)['"]/gm)) {
      const from = m[2]
      if (m[1] || !/^@\/lib\/(queries|db)\//.test(from)) continue
      if (from !== '@/lib/queries/builder' && from !== '@/lib/db/actor') failures.push(`${file}  builder: a Builder file imports ${from} (only @/lib/queries/builder and the Actor's type)`)
    }
  }
  if (file === 'src/lib/queries/builder.ts') {
    for (const m of text.matchAll(/export (?:async )?function (\w+)[^{]*\{([\s\S]*?)\n\}/g)) {
      if (!/\bwithActor\(/.test(m[2])) failures.push(`${file}  asserts: ${m[1]} does not open its transaction through withActor(`)
    }
  }
  if (!['src/domains/tenancy/roles.ts', 'src/domains/partners/team.ts'].includes(file) && /\[[^\]\n]*'(owner|admin|staff|accountant)'[^\]\n]*'builder'[^\]\n]*\]/.test(text)) {
    failures.push(`${file}  role-list: a list naming 'builder' beside a member role — say it once in CAPABILITIES (roles.ts)`)
  }
  if (/\b(set|reset)\s+role\b|set_config\(\s*'role'/i.test(text)) failures.push(`${file}  set-role: a Builder connects as frata_builder; nothing in src switches role`)
  if (/\.role\s*[!=]==\s*'(owner|admin|staff|partner|accountant|builder)'/.test(text) && !ROLE_EQ.has(file)) {
    failures.push(`${file}  role-eq: a member role compared by hand — ask holds(role, capability) (roles.ts)`)
  }
}
if (failures.length) { console.error(failures.join('\n') + `\ncheck:capabilities — ${failures.length} problem(s). See docs/decisions/0015-capabilities-and-the-builder-role.md.`); process.exit(1) }
console.log('check:capabilities — clean')
