#!/usr/bin/env node
// =============================================================================
// FILE: scripts/check-studio.mjs — `node scripts/check-studio.mjs [file]` (check:studio; ADR-0020 "Gate", plan
// docs/plans/2026-11-22-v3a-runtime.md R4; landed before the tool code).
//
// Fails:
//   agent    the committed agent file (studio/agents/frrata-agent/agent.md, JSON frontmatter) or its environment.yaml
//            differs from the policy: the model, effort and inference geo of src/domains/studio/model.ts; web fetch and
//            web search off; no multiagent; the custom tools equal to TOOL_NAMES; networking limited, the hosts equal
//            to ALLOWED_HOSTS, package managers and MCP servers off. The caps table has no row for the model. The vault
//            credential is not header-only.
//   bind     the setting that binds Studio's partner, or the old partner setting, written anywhere in src (only the
//            database's definers write the bind; drizzle/0167).
//   definers a Studio definer called outside the files allowed to call it (each one's callers are named below).
//   tools    a tool executor (src/lib/studio/tools/) importing beyond its allow-list, or calling the raw db, a tenant
//            transaction or withActor itself: executors run only through asTurn, which hands them their reads and
//            their write.
//   tx       inside a transaction callback in src/lib/studio (withTenant, withStudio, a turn's write), a call to the
//            runtime, or to a cached loader from src/lib/queries (a reader that takes the transaction, `…With(tx, …)`,
//            is fine). A cached loader inside a transaction deadlocks the pool; a network call holds a connection.
//   doors    a Studio action or route that does not start with requireStudio(); the Studio cron without
//            isCronRequest(; a file importing the advance (only cron.ts and sessions.ts), asTurn (only the
//            advance), sessions.ts (only the Studio actions and rows) or cron.ts (only the cron route), so a turn or session id comes from
//            the cron's work list or the person's own session, never a request.
//   inputs   a tool input schema with an id-shaped key (a tool's input never names a store, person or row).
// Comment lines are skipped everywhere (and in a Markdown file all but its fenced code), so this header and the records
// that describe the gate cannot fail it: `node scripts/check-studio.mjs <file>` runs the source rules on one file, and
// this file, docs/decisions/0020-studio-agent.md and docs/plans/2026-11-22-v3a-runtime.md must stay clean.
// =============================================================================
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'

const failures = []
const fail = (what, why) => failures.push(`${what}  ${why}`)
const read = (f) => readFileSync(f, 'utf8')
const isComment = (l) => { const t = l.trim(); return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('--') }
/** A file's code, comment lines blanked; for Markdown (a plan or a decision record describing this gate), only its fenced code. */
const code = (f) => {
  const lines = read(f).split(/\r?\n/)
  if (f.endsWith('.md')) { let inFence = false; return lines.map((l) => { if (/^\s*```/.test(l)) { inFence = !inFence; return '' } return inFence && !isComment(l) ? l : '' }).join('\n') }
  return lines.map((l) => (isComment(l) ? '' : l.replace(/\s\/\/.*$/, ''))).join('\n')
}
const walk = (dir) => !existsSync(dir) ? [] : statSync(dir).isFile() ? [dir] : readdirSync(dir).flatMap((n) => {
  const p = join(dir, n).replaceAll('\\', '/')
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) && !p.includes('/__tests__/') ? [p] : []
})

// ── The source rules, for one file (also the self-check) ──────────────────────────────────────────────────────────
const SETTING = /set_config\s*\(\s*['"`]app\.(studio_bind|partner_id)['"`]/
/** Each Studio definer and the only files that may call it. */
const DEFINERS = {
  app_studio_partner: ['src/lib/studio/with-studio.ts'],
  app_studio_bind_turn: ['src/lib/studio/as-turn.ts'],
  app_turn_actor: ['src/lib/studio/as-turn.ts'],
  app_studio_due: ['src/lib/db/studio.ts'],
  app_studio_sweep_binds: ['src/lib/db/studio.ts'],
  app_studio_new_session: ['src/lib/studio/sessions.ts'],
  app_studio_set_vendor: ['src/lib/studio/sessions.ts'],
  app_studio_set_key: ['src/lib/studio/sessions.ts'],
  app_studio_open_turn: ['src/lib/studio/sessions.ts'],
  app_studio_spend_of: ['src/lib/studio/sessions.ts', 'src/lib/studio/advance.ts'],
  app_studio_close_turn: ['src/lib/studio/advance.ts', 'src/lib/studio/sessions.ts'],
  app_studio_end_session: ['src/lib/studio/sessions.ts', 'src/lib/studio/cron.ts'],
  app_studio_session_facts: ['src/lib/studio/cron.ts'],
  app_studio_cleanup_of: ['src/lib/studio/cron.ts'],
  app_studio_delete_of: ['src/lib/studio/cron.ts'],
  app_studio_mark: ['src/lib/studio/cron.ts'],
}
/** Who may import the turn's doors (tenancy audit of R5, M): a turn id reaches them only from the cron's ids-only work
 *  list or from the person's own open session read under withStudio (sessions.ts), never from a request. */
const IMPORTERS = {
  'src/lib/studio/advance': ['src/lib/studio/cron.ts', 'src/lib/studio/sessions.ts'],
  // Its cron side ends and cleans sessions with no person's bind (tenancy audit of R6, M): the Studio actions (the
  // person's own session, under withStudio) and the cron route only.
  'src/lib/studio/sessions': ['src/app/(partner)/partner/studio/actions.ts', 'src/app/(partner)/partner/studio/rows/route.ts'],
  // The cron's side acts without a person's bind (tenancy audits of R6 and R7): the cron route only.
  'src/lib/studio/cron': ['src/app/api/cron/studio/route.ts'],
  // asTurn and its bind step (withTurnBound) are reached only through this module: the advance, and the tools, which
  // only ever get the turn asTurn hands them (their exemption is this module's only).
  'src/lib/studio/as-turn': ['src/lib/studio/advance.ts'],
}
/** Every module a file reaches at run time (static imports, `export … from`, dynamic imports), as repo paths without an
 *  extension; type-only imports aside (security re-review of R5: a relative or re-exported path passed the first pin). */
function reached(file, text) {
  const out = []
  const re = /\b(import|export)\s+(type\s+)?[^'"`;]*?from\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  for (const m of text.matchAll(re)) {
    if (m[2]) continue
    const spec = m[3] ?? m[4]
    const path = spec.startsWith('@/') ? 'src/' + spec.slice(2) : spec.startsWith('.') ? normalize(join(dirname(file), spec)) : null
    if (path) out.push(path.replace(/\\/g, '/').replace(/\.(ts|tsx|js|mjs)$/, '').replace(/\/index$/, ''))
  }
  return out
}
const TX_OPENERS = /\b(withTenant|withStudio|write)\s*\(/g
const RUNTIME_CALL = /\b(runtime|managedRuntime|rt)\s*\.\s*\w+\s*\(/

/** The text of each call's parentheses, from the opener to its matching close. */
function spans(text, opener) {
  const out = []
  for (const m of text.matchAll(opener)) {
    let depth = 0, i = m.index + m[0].length - 1
    for (let j = i; j < text.length; j++) {
      if (text[j] === '(') depth++
      else if (text[j] === ')' && --depth === 0) { out.push(text.slice(i, j + 1)); break }
    }
  }
  return out
}

function sourceRules(file, text) {
  if (SETTING.test(text)) fail(file, 'bind: writes the partner bind setting — only the database\'s definers bind (drizzle/0167)')
  for (const [fn, allowed] of Object.entries(DEFINERS)) {
    if (new RegExp(`\\b${fn}\\s*\\(`).test(text) && !allowed.includes(file)) fail(file, `definers: calls ${fn}( — only ${allowed.join(', ')}`)
  }
  for (const path of reached(file, text)) {
    const allowed = IMPORTERS[path]
    const toolType = path === 'src/lib/studio/as-turn' && file.startsWith('src/lib/studio/tools/')
    if (allowed && !allowed.includes(file) && !toolType) fail(file, `doors: reaches ${path} — only ${allowed.join(', ')} (a turn id never comes from a request)`)
  }
  if (file.startsWith('src/lib/studio/')) {
    const cached = [...text.matchAll(/import\s+\{([^}]*)\}\s+from\s+['"]@\/lib\/queries\/[\w/-]+['"]/g)]
      .flatMap((m) => m[1].split(',').map((x) => x.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()))
      .filter((n) => n && !/With$/.test(n) && !/^[A-Z]/.test(n))
    for (const body of spans(text, TX_OPENERS)) {
      if (RUNTIME_CALL.test(body)) fail(file, 'tx: a runtime call inside a transaction callback — make the call after the commit')
      for (const n of cached) if (new RegExp(`\\b${n}\\s*\\(`).test(body)) fail(file, `tx: the cached loader ${n}( inside a transaction callback — read it before, or use its …With(tx, …) form`)
    }
  }
}

// ── A single file: the self-check ──────────────────────────────────────────────────────────────────────────────────
if (process.argv[2]) {
  sourceRules(process.argv[2], code(process.argv[2]))
  if (failures.length) { for (const f of failures) console.error(f); process.exit(1) }
  console.log(`check:studio — clean (${process.argv[2]})`)
  process.exit(0)
}

// ── The agent files against the policy ─────────────────────────────────────────────────────────────────────────────
const one = (file, re, what) => { const m = read(file).match(re); if (!m) { fail(file, `agent: cannot read ${what}`); return null } return m[1] }
const MODEL = one('src/domains/studio/model.ts', /STUDIO_MODEL\s*=\s*'([^']+)'/, 'STUDIO_MODEL')
const EFFORT = one('src/domains/studio/model.ts', /STUDIO_EFFORT\s*=\s*'([^']+)'/, 'STUDIO_EFFORT')
const GEO = one('src/domains/studio/model.ts', /STUDIO_GEO\s*=\s*'([^']+)'/, 'STUDIO_GEO')
const toolsList = one('src/domains/studio/tools.ts', /TOOL_NAMES\s*=\s*\[([^\]]+)\]/, 'TOOL_NAMES')
const TOOLS = toolsList ? [...toolsList.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort() : []
const apiHost = one('src/domains/studio/policy.ts', /API_HOST\s*=\s*'([^']+)'/, 'API_HOST')
const hostsList = one('src/domains/studio/policy.ts', /ALLOWED_HOSTS\s*=\s*\[([^\]]+)\]/, 'ALLOWED_HOSTS')
const HOSTS = hostsList ? hostsList.split(',').map((h) => h.trim()).map((h) => (h === 'API_HOST' ? apiHost : h.replace(/'/g, ''))).filter(Boolean).sort() : []

const AGENT = 'studio/agents/frrata-agent/agent.md', ENV = 'studio/agents/frrata-agent/environment.yaml'
let agent = null, env = null
try { agent = JSON.parse(read(AGENT).split(/^---\s*$/m)[1]) } catch { fail(AGENT, 'agent: the frontmatter is not JSON (JSON is valid YAML; this gate reads it as JSON)') }
try { env = JSON.parse(read(ENV)) } catch { fail(ENV, 'agent: not JSON') }
if (agent) {
  if (agent.model?.id !== MODEL) fail(AGENT, `agent: model ${agent.model?.id} is not STUDIO_MODEL (${MODEL})`)
  if (agent.model?.effort !== EFFORT) fail(AGENT, `agent: effort ${agent.model?.effort} is not ${EFFORT} (set it explicitly)`)
  if (agent.model?.inference_geo !== GEO) fail(AGENT, `agent: inference_geo ${agent.model?.inference_geo} is not ${GEO} (the workspace default is global)`)
  if ('multiagent' in agent) fail(AGENT, 'agent: multiagent is set — Studio\'s agent works alone')
  const toolset = (agent.tools ?? []).find((t) => t.type === 'agent_toolset_20260401')
  for (const n of ['web_fetch', 'web_search']) {
    if (toolset?.configs?.find((c) => c.name === n)?.enabled !== false) fail(AGENT, `agent: ${n} is not switched off`)
  }
  const custom = (agent.tools ?? []).filter((t) => t.type === 'custom').map((t) => t.name).sort()
  if (custom.join() !== TOOLS.join()) fail(AGENT, `agent: custom tools [${custom}] differ from TOOL_NAMES [${TOOLS}]`)
  if ((agent.tools ?? []).some((t) => t.type === 'mcp_toolset') || agent.mcp_servers?.length) fail(AGENT, 'agent: an MCP server — Studio\'s agent reaches Frrata only through its custom tools')
}
if (env) {
  const n = env.config?.networking ?? {}
  if (n.type !== 'limited') fail(ENV, 'agent: networking is not limited')
  if ([...(n.allowed_hosts ?? [])].sort().join() !== HOSTS.join()) fail(ENV, `agent: allowed_hosts [${n.allowed_hosts}] differ from ALLOWED_HOSTS [${HOSTS}]`)
  if (n.allow_package_managers !== false) fail(ENV, 'agent: allow_package_managers is not false (true opens GitHub and the registries; spike)')
  if (n.allow_mcp_servers !== false) fail(ENV, 'agent: allow_mcp_servers is not false')
}
const spend = read('src/domains/studio/spend.ts')
if (!/\[STUDIO_MODEL\]\s*:/.test(spend) && !(MODEL && spend.includes(`'${MODEL}':`))) fail('src/domains/studio/spend.ts', `agent: the caps table has no row for ${MODEL}`)
const rm = existsSync('src/lib/studio/runtime-managed.ts') ? code('src/lib/studio/runtime-managed.ts') : ''
if (rm && (!/injection_location:\s*\{\s*header:\s*true\s*\}/.test(rm) || /\bbody:\s*true/.test(rm))) fail('src/lib/studio/runtime-managed.ts', 'agent: the vault credential is not header-only')

// ── The source, file by file ───────────────────────────────────────────────────────────────────────────────────────
const TOOL_IMPORTS = [/^server-only$/, /^zod$/, /^drizzle-orm$/, /^@\/domains\//, /^@\/lib\/queries\/builder$/, /^@\/lib\/studio\/(as-turn|hosting)$/, /^@\/lib\/db\/schema-studio$/, /^\.\//]
for (const file of walk('src')) {
  const text = code(file)
  sourceRules(file, text)
  if (file.startsWith('src/lib/studio/tools/')) {
    for (const m of text.matchAll(/import\s+(type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]/g)) {
      if (m[1]) continue
      if (!TOOL_IMPORTS.some((re) => re.test(m[2]))) fail(file, `tools: imports ${m[2]} — an executor reads through asTurn's reads and writes through its write`)
    }
    if (/\b(db|withTenant|withActor|withStudio)\s*\(/.test(text)) fail(file, 'tools: opens its own connection or transaction — asTurn hands it its reads and its write')
  }
  if (file.startsWith('src/app/(partner)/partner/studio/') && (/^\s*['"]use server['"]/m.test(text) || /\/route\.ts$/.test(file)) && !/\brequireStudio\s*\(/.test(text)) {
    fail(file, 'doors: a Studio action or route without requireStudio(')
  }
  if (file === 'src/app/api/cron/studio/route.ts' && !/\bisCronRequest\s*\(/.test(text)) fail(file, 'doors: the Studio cron without isCronRequest(')
}
const inputs = read('src/domains/studio/tools.ts').match(/TOOL_INPUTS\s*=\s*\{([\s\S]*?)\}\s*as const/)
if (inputs && /\b\w*(_id|Id)\s*:/.test(inputs[1])) fail('src/domains/studio/tools.ts', 'inputs: a tool input has an id-shaped key')

if (failures.length) {
  for (const f of failures) console.error(f)
  console.error(`check:studio — ${failures.length} problem(s)`)
  process.exit(1)
}
console.log(`check:studio — clean (agent ${MODEL}, ${TOOLS.length} tools, hosts ${HOSTS.join(' ')})`)
