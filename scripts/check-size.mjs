#!/usr/bin/env node
// Fails: a file over 400 lines, or a pinned one that grew.
//
// Stops new files growing into the ones we already regret.
//
// ⚠️ WHY THIS EXISTS. Ekatan's studio grew three UI files to 1400, 1074 and 783
// lines, one reasonable addition at a time. A paragraph never catches that drift;
// a gate does.
//
// ⚠️ A LINE COUNT IS A CRUDE MEASURE, ON PURPOSE. It is not a judgement about
// design — a 500-line file can be perfectly clear and a 200-line one a mess.
// What it is good at is the thing that actually happened here: nobody noticing
// until it is a week's work to undo. So the threshold is deliberately generous
// and the existing offenders are pinned rather than exempted (see BUDGETS):
// they may shrink, never grow. Delete a pin when the file drops under LIMIT.
//
// Follows check-hex/check-layers: forward-slashed paths, the
// same exemption shape, one line per failure, non-zero exit.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const LIMIT = 400

const EXEMPT = [
  // Tests may be long: a table of cases is not a tangle.
  /__tests__\//,
]

/**
 * Files already over the limit when this gate was written.
 *
 * The number is a CEILING, not a target — each may shrink freely, and the gate
 * fails the moment one grows. They are here so the rule can start protecting
 * everything else today rather than waiting on a refactor.
 */
const BUDGETS = {}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue
      yield* walk(full)
    } else if (/\.(ts|tsx)$/.test(name)) {
      yield full
    }
  }
}

let failures = 0
const shrunk = []

for (const file of walk('src')) {
  const rel = relative('.', file).split('\\').join('/')
  if (EXEMPT.some(re => re.test(rel))) continue

  // Newline COUNT, matching wc -l. Counting array elements reads one line
  // long for any file ending in a newline, which is all of them.
  const text = readFileSync(file, 'utf8')
  const lines = text.length === 0
    ? 0
    : text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
  const budget = BUDGETS[rel]

  if (budget !== undefined) {
    if (lines > budget) {
      console.error(`${rel}  ${lines} lines — over its pinned budget of ${budget}`)
      failures++
    } else if (lines < budget) {
      shrunk.push(`${rel}  ${lines} (budget ${budget})`)
    }
    continue
  }

  if (lines > LIMIT) {
    console.error(`${rel}  ${lines} lines — over the ${LIMIT} limit`)
    failures++
  }
}

if (failures) {
  console.error(
    `\n${failures} file(s) too long.\n` +
    `  New files: keep under ${LIMIT} lines. Split by RESPONSIBILITY, not by\n` +
    `  line count — pull out one thing that has its own reason to change.\n` +
    `  Known offenders are pinned in scripts/check-size.mjs and may only shrink.`,
  )
  process.exit(1)
}

if (shrunk.length) {
  console.log('check:size — clean (pinned files have shrunk; lower their budgets)')
  for (const s of shrunk) console.log(`  ${s}`)
} else {
  console.log('check:size — clean')
}
