#!/usr/bin/env node
// Fails: a skill or agent without its front-matter and metadata, a skill body over 500 lines (pinned ones may only shrink), a reference file nested or unlinked, an eval off its schema, or a body changed without a metadata.version bump.
//
// check:skills — the rules that let an agent find a skill and read it whole, and that tell a reader which version
// of a rule they hold (spec docs/specs/2026-11-16-practices-from-ekatan.md, after Ekatan's gate of the same name).
//
//   Skills (.claude/skills/<name>/SKILL.md)
//     1. `name` is the folder's name: lowercase, digits, hyphens, ≤ 64 chars
//     2. `description` ≤ 1,024 chars, opens "Use when" / "Use before"
//     3. the body is ≤ 500 lines; a PINNED skill may not pass its pin (split it into reference files)
//     4. every other .md in the folder is linked from SKILL.md and links no further .md in the folder
//     5. a reference file over 100 lines opens with a "## Contents" list in its first 20 lines
//     6. every evals/*.json parses and has skills (naming this one), query, files, expected_behavior
//   Agents (.claude/agents/<name>.md; scenarios in .claude/agents/evals/<name>/*.json)
//     1. `name` is the file's name, and there is a `description`
//     6. every scenario has agent (this one), query, input, expected_behavior
//   Both
//     7. `metadata:` carries version (x.y.z), owner and verified (YYYY-MM-DD)
//     8. a body (or a skill's reference file) changed since the base with the same metadata.version fails. The base is SKILLS_BASE (CI sets it to
//        the push's `before`), else the merge base with origin/main; with neither, the rule is skipped, said aloud.
//
// It reads skills and agents, not prose about them, so it cannot match its own comment.

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readFrontmatter } from './lib/frontmatter.mjs'

const SKILLS = '.claude/skills'
const AGENTS = '.claude/agents'
const MAX_BODY = 500
const MAX_DESCRIPTION = 1024
const TOC_OVER = 100

// A skill over the limit, held at its length until it is split into reference files. Empty since G4 of the practices
// plan (2026-11-16) split design-language, architecture and integrations; add one only with a plan to split it.
/** @type {Record<string, number>} */
export const PINNED = {}

const git = (args) => {
  try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 }) }
  catch { return null }
}

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n).replaceAll('\\', '/')
  return statSync(p).isDirectory() ? walk(p) : [p]
})

const linksIn = (t) => [...t.matchAll(/\]\(([^)#\s]+\.md)\)/g)].map((m) => m[1])

export function checkMetadata(file, data, fail) {
  const meta = data.metadata && typeof data.metadata === 'object' ? data.metadata : {}
  if (!/^\d+\.\d+\.\d+$/.test(meta.version ?? '')) fail(`${file}  metadata.version must be x.y.z`)
  if (!meta.owner) fail(`${file}  metadata.owner is missing`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.verified ?? '')) fail(`${file}  metadata.verified must be YYYY-MM-DD`)
}

// Rule 8, given the file as it was at the base (null when new) and as it is now. `refsBefore`/`refsNow`: a skill's
// reference files joined (its rules live there too since G4), so an edit to one needs the bump as well.
export function bumpProblem(file, before, now, refsBefore = '', refsNow = '') {
  if (before === null) return null
  const old = readFrontmatter(before)
  const cur = readFrontmatter(now)
  const was = old.data?.metadata?.version
  const is = cur.data?.metadata?.version
  if (!was || (old.body === cur.body && refsBefore === refsNow) || was !== is) return null
  return `${file}  body changed since the base but metadata.version is still ${is} — bump it (major: a rule changed meaning; minor: a rule added; patch: wording)`
}

export function checkSkill(dir, name, fail) {
  const file = `${dir}/SKILL.md`
  const { data, errors, body } = readFrontmatter(readFileSync(file, 'utf8'))
  for (const e of errors) fail(`${file}  ${e}`)
  if (!data) return fail(`${file}  no front-matter`)
  if (data.name !== name) fail(`${file}  name "${data.name}" is not the folder's name "${name}"`)
  if (!/^[a-z0-9-]{1,64}$/.test(name)) fail(`${file}  name must be lowercase letters, digits and hyphens, ≤ 64 chars`)
  const d = String(data.description ?? '')
  if (!d) fail(`${file}  no description`)
  if (d.length > MAX_DESCRIPTION) fail(`${file}  description is ${d.length} chars (max ${MAX_DESCRIPTION})`)
  if (d && !/^Use (when|before)\b/.test(d)) fail(`${file}  description should open "Use when …" — it is what an agent matches a task against`)
  const lines = body.split(/\r?\n/).length
  const limit = PINNED[name] ?? MAX_BODY
  if (lines > limit) {
    fail(PINNED[name]
      ? `${file}  body is ${lines} lines; pinned at ${limit} and may only shrink (move a section into a reference file)`
      : `${file}  body is ${lines} lines (max ${MAX_BODY}); move detail into reference files linked from SKILL.md`)
  }
  if (PINNED[name] && lines <= MAX_BODY) fail(`${file}  is ${lines} lines, within ${MAX_BODY}: remove its pin in scripts/check-skills.mjs`)
  const linked = new Set(linksIn(body).map((l) => `${dir}/${l.replace(/^\.\//, '')}`))
  for (const ref of walk(dir).filter((p) => p.endsWith('.md') && p !== file)) {
    if (!linked.has(ref)) fail(`${ref}  is not linked from ${file}; an agent will never open it`)
    const rt = readFileSync(ref, 'utf8')
    for (const l of linksIn(rt)) if (!/^(https?:|\.\.\/\.\.\/|\/)/.test(l)) fail(`${ref}  links ${l}; keep references one level deep from SKILL.md`)
    const rl = rt.split(/\r?\n/)
    if (rl.length > TOC_OVER && !/^## Contents\b/m.test(rl.slice(0, 20).join('\n'))) fail(`${ref}  is over ${TOC_OVER} lines and has no "## Contents" list in its first 20 lines`)
  }
  checkMetadata(file, data, fail)
  if (existsSync(`${dir}/evals`)) {
    for (const ev of readdirSync(`${dir}/evals`).filter((f) => f.endsWith('.json'))) {
      const at = `${dir}/evals/${ev}`
      try {
        const e = JSON.parse(readFileSync(at, 'utf8'))
        if (!Array.isArray(e.skills) || !e.skills.includes(name)) fail(`${at}  "skills" must list ${name}`)
        if (typeof e.query !== 'string' || !e.query.trim()) fail(`${at}  needs a "query"`)
        if (!Array.isArray(e.files)) fail(`${at}  needs a "files" list (empty is fine)`)
        if (!Array.isArray(e.expected_behavior) || !e.expected_behavior.length) fail(`${at}  needs a non-empty "expected_behavior" list`)
      } catch (err) { fail(`${at}  is not valid JSON: ${err.message}`) }
    }
  }
}

export function checkAgent(file, name, fail) {
  const { data, errors } = readFrontmatter(readFileSync(file, 'utf8'))
  for (const e of errors) fail(`${file}  ${e}`)
  if (!data) return fail(`${file}  no front-matter`)
  if (data.name !== name) fail(`${file}  name "${data.name}" is not the file's name "${name}"`)
  if (!String(data.description ?? '').trim()) fail(`${file}  no description`)
  checkMetadata(file, data, fail)
  const evals = `${AGENTS}/evals/${name}`
  if (existsSync(evals)) {
    for (const ev of readdirSync(evals).filter((f) => f.endsWith('.json'))) {
      const at = `${evals}/${ev}`
      try {
        const e = JSON.parse(readFileSync(at, 'utf8'))
        if (e.agent !== name) fail(`${at}  "agent" must be ${name}`)
        if (typeof e.query !== 'string' || !e.query.trim()) fail(`${at}  needs a "query"`)
        if (typeof e.input !== 'string' || !e.input.trim()) fail(`${at}  needs an "input" (the planted code or plan)`)
        if (!Array.isArray(e.expected_behavior) || !e.expected_behavior.length) fail(`${at}  needs a non-empty "expected_behavior" list`)
      } catch (err) { fail(`${at}  is not valid JSON: ${err.message}`) }
    }
  }
}

function main() {
  const failures = []
  const fail = (m) => failures.push(m)
  const files = []
  for (const name of existsSync(SKILLS) ? readdirSync(SKILLS).sort() : []) {
    const dir = `${SKILLS}/${name}`
    if (!existsSync(`${dir}/SKILL.md`)) continue
    checkSkill(dir, name, fail)
    files.push(`${dir}/SKILL.md`)
  }
  for (const f of existsSync(AGENTS) ? readdirSync(AGENTS).filter((n) => n.endsWith('.md')).sort() : []) {
    checkAgent(`${AGENTS}/${f}`, f.replace(/\.md$/, ''), fail)
    files.push(`${AGENTS}/${f}`)
  }
  const base = process.env.SKILLS_BASE?.trim() || git(['merge-base', 'HEAD', 'origin/main'])?.trim() || null
  if (base && git(['cat-file', '-e', `${base}^{commit}`]) !== null) {
    for (const file of files) {
      const refs = (at) => {
        if (!file.endsWith('/SKILL.md')) return ''
        const dir = file.slice(0, -'/SKILL.md'.length)
        const names = at ? (git(['ls-tree', '-r', '--name-only', at, '--', dir]) ?? '').split('\n') : walk(dir)
        return names.filter((n) => n.endsWith('.md') && n !== file).sort().map((n) => `${n}\n${at ? git(['show', `${at}:${n}`]) : readFileSync(n, 'utf8')}`).join('\n')
      }
      const p = bumpProblem(file, git(['show', `${base}:${file}`]), readFileSync(file, 'utf8'), refs(base), refs(null))
      if (p) fail(p)
    }
  } else {
    console.log('check:skills — no base commit (no SKILLS_BASE, no origin/main): version bumps not checked')
  }
  if (failures.length) {
    for (const f of failures) console.error(f)
    console.error(`check:skills — ${failures.length} problem(s)`)
    process.exit(1)
  }
  console.log(`check:skills — clean (${files.length} skills and agents)`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
