#!/usr/bin/env node
// =============================================================================
// FILE: scripts/eval.mjs — `npm run eval -- <skill-or-agent> [scenario] [--judge] [--record]`
//
// Runs a skill's or a review agent's scenarios in a fresh headless Claude Code session each and prints the answer
// beside what was expected (after Ekatan's eval-skill.mjs; practices plan, G3).
//   skills  .claude/skills/<name>/evals/*.json   { skills, query, files, expected_behavior }
//   agents  .claude/agents/evals/<name>/*.json   { agent, query, input, expected_behavior } — `input` is the planted
//           code or plan; the agent's own body is the session's system prompt
//   --judge   a second session, with no tools, marks each expected behaviour MET or NOT MET; a miss exits 1
//   --record  writes the answer and the verdict (nothing else) to docs/evals/<name>/<date>-<scenario>.md, after a
//             secret scan that refuses to write on a match (the repo is public)
// Run before a MAJOR version bump of that skill or agent, never in npm test: each scenario is two model calls.
//
// ⚠️ THE CHILD IS READ-ONLY AND REACHES NOTHING (security review S1, S7). A scenario is text from a repo file that any
// lane can add, so it is treated as hostile: built-in tools Read/Grep/Glob/Skill only, no MCP server, project settings
// only, no reads of /proc, the credential folders under HOME or .env files, and an environment holding only PATH, HOME, the proxy, the
// CA and the model's base URL (no GitHub, AWS or cloud tokens). The prompt goes on stdin; nothing runs in a shell.
// =============================================================================
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { readFrontmatter } from './lib/frontmatter.mjs'

const KEEP_ENV = /^(PATH|HOME|ANTHROPIC_BASE_URL|HTTPS?_PROXY|https?_proxy|NO_PROXY|no_proxy|NODE_EXTRA_CA_CERTS|SSL_CERT_FILE)$/
export const childEnv = (env) => Object.fromEntries(Object.entries(env).filter(([k]) => KEEP_ENV.test(k)))

// Folders under HOME that hold credentials. Named, not ~/** (a checkout under HOME would be unreadable).
const HOME_SECRETS = ['.ssh', '.aws', '.config', '.claude', '.gnupg', '.docker', '.kube']
const LOCKED = ['--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--setting-sources', 'project', '--permission-mode', 'default']
export const answerArgs = (system) => [
  '-p', '--tools', 'Read,Grep,Glob,Skill', '--allowedTools', 'Read', 'Grep', 'Glob', 'Skill',
  '--disallowedTools', 'Read(//proc/**)', ...HOME_SECRETS.map((d) => `Read(~/${d}/**)`), 'Read(~/.git-credentials)', 'Read(~/.netrc)',
  'Read(~/.npmrc)', 'Read(**/.env*)', ...LOCKED,
  ...(system ? ['--append-system-prompt', system] : []),
]
export const judgeArgs = () => ['-p', '--tools', '', ...LOCKED]

// Strings that must never be committed to a public repo, even inside a recorded answer.
const SECRETS = [/rzp_(live|test)_[A-Za-z0-9]{10,}/, /\bsk-[A-Za-z0-9_-]{20,}/, /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, /postgres(ql)?:\/\/[^\s:@]+:[^\s@]+@/,
  /\bAKIA[0-9A-Z]{16}\b/, /\bgh[pousr]_[A-Za-z0-9]{30,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/]
export const secretIn = (text) => SECRETS.find((r) => r.test(text))?.source ?? null

// The judge's lines graded: one per behaviour, each MET or NOT MET. Anything else (a missing line, extra prose
// instead of the format) is a failed scenario, never a pass.
export function gradeVerdict(verdict, count) {
  const lines = verdict.split('\n').map((l) => l.trim()).filter((l) => /^(NOT )?MET:/.test(l))
  const misses = lines.filter((l) => l.startsWith('NOT MET')).length
  return { ok: lines.length === count && misses === 0, met: lines.length - misses, misses, wellFormed: lines.length === count }
}

const claude = (args, prompt) => {
  const r = spawnSync('claude', args, { input: prompt, encoding: 'utf8', env: childEnv(process.env), timeout: 15 * 60 * 1000, maxBuffer: 16 << 20, shell: false })
  if (r.status !== 0) throw new Error(`claude exited ${r.status}: ${(r.stderr || '').slice(0, 300)}`)
  return r.stdout.trim()
}

export function scenarios(name) {
  const skillDir = `.claude/skills/${name}/evals`
  const agentDir = `.claude/agents/evals/${name}`
  const dir = existsSync(skillDir) ? skillDir : existsSync(agentDir) ? agentDir : null
  if (!dir) return null
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => ({ id: f.replace(/\.json$/, ''), ...JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) }))
}

function main() {
  const [name, only] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const judge = process.argv.includes('--judge')
  const record = process.argv.includes('--record')
  const list = name && scenarios(name)
  if (!list) {
    console.error('eval — usage: npm run eval -- <skill-or-agent> [scenario] [--judge] [--record]; no evals/ for that name')
    process.exit(1)
  }
  const agentFile = `.claude/agents/${name}.md`
  const isAgent = existsSync(agentFile) && !existsSync(`.claude/skills/${name}`)
  const own = readFrontmatter(readFileSync(isAgent ? agentFile : `.claude/skills/${name}/SKILL.md`, 'utf8'))
  const version = own.data?.metadata?.version ?? '?'
  if (only && !list.some((ev) => ev.id === only)) {
    console.error(`eval — no scenario "${only}" for ${name} (have: ${list.map((ev) => ev.id).join(', ')})`)
    process.exit(1)
  }
  let failed = 0
  for (const ev of list) {
    if (only && only !== ev.id) continue
    console.log(`\n=== ${name} ${version} / ${ev.id}\n\nQUERY: ${ev.query}\n`)
    const prompt = isAgent
      ? `${ev.query}\n\nDo not edit any file. The material to review:\n\n${ev.input}`
      : `Load the skill ${ev.skills.join(', ')} first. Then answer. Do not edit any file.\n\n${ev.query}`
    const answer = claude(answerArgs(isAgent ? own.body : null), prompt)
    console.log(`ANSWER:\n${answer}\n\nEXPECTED:\n${ev.expected_behavior.map((b) => `- ${b}`).join('\n')}`)
    let verdict = ''
    if (judge) {
      verdict = claude(judgeArgs(), [
        'You grade an answer against expected behaviours. Decide each behaviour first, silently; then output exactly',
        'one line per behaviour, in order: "MET: <behaviour>" or "NOT MET: <behaviour> — <why, in one clause>". No other text.',
        'A behaviour is MET when the answer raises that problem or gives its fix, in any words; it need not quote the',
        'behaviour. Grade each listed behaviour exactly once. A behaviour that asks for a command to be run is MET only if',
        'the answer shows it was run.',
        '', 'BEHAVIOURS:', ...ev.expected_behavior.map((b) => `- ${b}`), '', 'ANSWER:', answer,
      ].join('\n'))
      const g = gradeVerdict(verdict, ev.expected_behavior.length)
      if (!g.ok) failed++
      console.log(`\nVERDICT (${g.met}/${ev.expected_behavior.length}${g.wellFormed ? '' : ', the judge did not grade each behaviour once: failed'}):\n${verdict}`)
    }
    if (record) {
      const text = [`# ${name} ${version} — ${ev.id}`, '', `**Query:** ${ev.query}`, '', '## Answer', '', answer, '',
        '## Expected', '', ...ev.expected_behavior.map((b) => `- ${b}`), '', ...(verdict ? ['## Verdict', '', verdict, ''] : [])].join('\n')
      const hit = secretIn(text)
      if (hit) { console.error(`eval — not recorded: the answer matches a secret pattern (${hit})`); failed++; continue }
      const out = `docs/evals/${name}`
      mkdirSync(out, { recursive: true })
      writeFileSync(`${out}/${new Date().toISOString().slice(0, 10)}-${ev.id}.md`, text)
    }
  }
  if (judge && failed) { console.error(`\neval — ${failed} scenario(s) missed a behaviour`); process.exit(1) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
