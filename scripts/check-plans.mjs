#!/usr/bin/env node
// Fails: a plan dated 2026-11-17 or later without its **Mockup:**, dated **Approved:** and **Review:** header lines.
//
// check:plans — "nothing is executed before the owner approves the phase's mockup, and nothing is executed before the
// review agents have run on the plan" (CLAUDE.md, ADR-0001), held by a script instead of memory.
//
// Reads every plan in docs/plans/ whose file name starts with a date on or after FROM. In its first 15 lines it needs:
//   **Mockup:** <artifact link>, or "none — <why>"
//   **Approved:** <who>, <YYYY-MM-DD>          never "pending"
//   **Review:** <agent> <verdict>, <YYYY-MM-DD> one line or more. A plan whose Status: is draft may say "pending";
//                                                once it is active or done, each Review line has a date.
// Older plans are history and are left as written. Only those header lines are read, so a plan that mentions the
// word "pending" in its body passes, and this file, which is not in docs/plans/, cannot match its own description.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const DIR = 'docs/plans'
export const FROM = '2026-11-17'
const DATE = /\d{4}-\d{2}-\d{2}/

export function planProblems(name, text) {
  const head = text.split(/\r?\n/).slice(0, 15)
  const line = (label) => head.filter((l) => l.startsWith(`**${label}:**`)).map((l) => l.slice(label.length + 5).trim())
  const out = []
  const draft = /^Status:\s*draft\b/im.test(head.join('\n'))
  const [mockup] = line('Mockup')
  if (!mockup || mockup.startsWith('<')) out.push('no **Mockup:** line (an artifact link, or "none — <why>")')
  else if (/^none\b/i.test(mockup) && !/^none\s*[—–-]\s*\S/i.test(mockup)) out.push('**Mockup:** none needs a reason ("none — <why>")')
  const [approved] = line('Approved')
  if (!approved || approved.startsWith('<') || /pending/i.test(approved) || !DATE.test(approved)) {
    out.push('no **Approved:** line with who and the date — do not execute before sign-off')
  }
  const reviews = line('Review')
  if (!reviews.length) out.push('no **Review:** line — run the review agents on the plan (frata-planning rule 3)')
  for (const r of reviews) {
    if (/pending/i.test(r) ? !draft : !DATE.test(r)) {
      out.push(`**Review:** ${r.slice(0, 50)} — needs the verdict and its date${draft ? '' : ' (pending is allowed only while Status: draft)'}`)
    }
  }
  return out.map((p) => `${DIR}/${name}  ${p}`)
}

function main() {
  const failures = []
  let n = 0
  for (const name of existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.md')).sort() : []) {
    const date = name.slice(0, 10)
    if (!DATE.test(date) || date < FROM) continue
    n++
    failures.push(...planProblems(name, readFileSync(`${DIR}/${name}`, 'utf8')))
  }
  if (failures.length) {
    for (const f of failures) console.error(f)
    console.error(`check:plans — ${failures.length} problem(s)`)
    process.exit(1)
  }
  console.log(`check:plans — clean (${n} plan(s) from ${FROM})`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
