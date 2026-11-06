#!/usr/bin/env node
// Fails: a surface root with no error.tsx, so a failed page falls through to the bare global error.
//
// ⚠️ WHY. Every screen has its states (.claude/skills/frata-design-language/SKILL.md);
// the error state is the one a grep can hold. Without one, a failed console
// page loses its navigation and falls through to the bare global error.

import { existsSync } from 'node:fs'

const SURFACES = ['src/app/(console)/console', 'src/app/s/[host]']

const failures = SURFACES.filter(dir => existsSync(dir) && !existsSync(`${dir}/error.tsx`))
  .map(dir => `${dir}  has no error.tsx — copy the nearest surface's, in this surface's language`)
if (!existsSync('src/app/global-error.tsx')) failures.push('src/app/global-error.tsx  is gone — the root layout has no failure screen')
if (!existsSync('src/app/not-found.tsx')) failures.push("src/app/not-found.tsx  is gone — a wrong address gets Next's default page")
if (failures.length) {
  for (const f of failures) console.error(f)
  console.error(`check:states — ${failures.length} problem(s)`)
  process.exit(1)
}
console.log(`check:states — clean (${SURFACES.length} surfaces)`)
