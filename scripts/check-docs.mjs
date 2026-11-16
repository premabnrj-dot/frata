#!/usr/bin/env node
// Fails: a living doc (CLAUDE.md, .claude/**, docs/setup.md, docs/runbooks, e2e/README.md) naming a repo path that does not exist, or CLAUDE.md over 200 lines.
//
// check:docs — a doc that names a file that is gone sends the next agent to read nothing, and it reads as true.
// A path counts when it is in backticks and starts at a repo root folder (src/, scripts/, drizzle/, e2e/, docs/,
// .claude/, public/, kit/), with a `:line` suffix allowed. It exists when a file or folder of that name exists, or
// any tracked file starts with it (`drizzle/0000` names 0000_*.sql). Skipped: placeholders (NN, <name>, globs), paths
// git ignores (e2e/.out/ is output), and ALLOW below. Specs, plans, ADRs and research are history and not read
// (scripts/lib/doc-refs.mjs). Its own comment names no backticked path, so it cannot match itself.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { isLivingDoc, namedPaths } from './lib/doc-refs.mjs'

export const MAX_CLAUDE_MD = 200

// A path a doc names on purpose although it does not exist, with why.
const ALLOW = {
  'src/domains/orders/__tests__/model.scratch.test.ts': 'unit-economics-reviewer creates it, runs it and deletes it',
}

export function missingPaths(doc, text, exists) {
  return namedPaths(text).filter(({ path }) => !ALLOW[path] && !exists(path)).map(({ path, line }) => `${doc}:${line}  names ${path}, which does not exist`)
}

function main() {
  const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').filter(Boolean)
  const ignored = (p) => { try { execFileSync('git', ['check-ignore', '-q', '--no-index', p]); return true } catch { return false } }
  const exists = (p) => existsSync(p) || tracked.some((f) => f.startsWith(p)) || ignored(p)
  const failures = []
  const docs = tracked.filter(isLivingDoc)
  for (const doc of docs) failures.push(...missingPaths(doc, readFileSync(doc, 'utf8'), exists))
  const lines = readFileSync('CLAUDE.md', 'utf8').split(/\r?\n/).length
  if (lines > MAX_CLAUDE_MD) failures.push(`CLAUDE.md  is ${lines} lines (max ${MAX_CLAUDE_MD}): a rule a script can check belongs in a gate, history in docs/decisions/`)
  if (failures.length) {
    for (const f of failures) console.error(f)
    console.error(`check:docs — ${failures.length} problem(s)`)
    process.exit(1)
  }
  console.log(`check:docs — clean (${docs.length} living docs, CLAUDE.md ${lines} lines)`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
