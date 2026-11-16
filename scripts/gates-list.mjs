#!/usr/bin/env node
// =============================================================================
// FILE: scripts/gates-list.mjs — `npm run gates:list`: every gate Frrata runs and what each fails, read from the gates.
//
// The list is `package.json`'s `gates` chain (npm test runs it, and the commit hook) and its `postbuild` chain (after
// next build, on Vercel too). Each gate's sentence is the first "// Fails" paragraph in its first 25 lines. Nothing
// is written or committed: a copied list is what went stale in CLAUDE.md (17 of 27 gates, 2026-11-16).
// =============================================================================
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// "node scripts/x.mjs --flag" commands of an npm script, in order.
export const commands = (chain = '') => chain.split('&&').map((c) => c.trim()).filter((c) => /^node scripts\/\S+\.mjs/.test(c))

// The first "// Fails" paragraph of a gate's header, one line.
export function failsLine(source) {
  const lines = source.split(/\r?\n/).slice(0, 25)
  const at = lines.findIndex((l) => /^\/\/\s*(Fails|GATE)\b/.test(l))
  if (at < 0) return '(no "// Fails:" line in its header)'
  const out = [lines[at].replace(/^\/\/\s*/, '')]
  for (const l of lines.slice(at + 1)) {
    if (/[.:]$/.test(out.at(-1)) || !/^\/\/ \S/.test(l) || /^\/\/ {2,}/.test(l) || /^\/\/ =/.test(l)) break
    out.push(l.replace(/^\/\/\s*/, ''))
  }
  const text = out.join(' ').replace(/\s+/g, ' ')
  return text.length > 220 ? `${text.slice(0, 217)}…` : text
}

function main() {
  const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts
  const nameOf = (cmd) => Object.entries(scripts).find(([k, v]) => v === cmd && k !== 'gates' && k !== 'test')?.[0] ??
    cmd.match(/scripts\/check-([a-z-]+)\.mjs/)?.[1].replace(/^/, 'check:') ?? cmd.replace(/^node scripts\//, '')
  for (const [chain, when] of [['gates', 'npm test, and before every commit (the pre-bash hook)'], ['postbuild', 'after next build (Vercel too)']]) {
    console.log(`\n${chain} — ${when}\n`)
    for (const cmd of commands(scripts[chain])) {
      const file = cmd.split(/\s+/)[1]
      console.log(`  ${nameOf(cmd).padEnd(20)} ${failsLine(readFileSync(file, 'utf8'))}`)
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
