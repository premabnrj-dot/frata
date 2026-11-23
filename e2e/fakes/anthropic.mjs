// Test-only stand-in for Anthropic's Managed Agents API (STUDIO_ANTHROPIC_BASE in the local end-to-end run and in
// src/lib/studio tests). Never deployed. Plan docs/plans/2026-11-22-v3a-runtime.md R3.
// The paths, shapes and rules Studio relies on, as the SDK 1.12.0 types and the spike measured them:
//   - every request needs the key (SDK 1.12.0 sends `Authorization: Bearer <key>`; x-api-key also accepted) and the beta header `managed-agents-2026-04-01` (files: the files beta);
//   - a session is created only WITH a budget (a budget can never be added later); the budget can be raised, never to
//     at or below what is spent; at the budget the session pauses (`budget_reached`) and accepts only settle events;
//     raising the budget resumes the paused work (so Studio interrupts before its next message);
//   - one `requires_action` idle per round of custom tool calls; answering a round one call at a time raises an extra
//     idle for the calls still pending (spike);
//   - events are listed ascending by `processed_at`, filtered by `created_at[gte]`; with `state.queueNext` the next
//     user.message is listed queued (no `processed_at`) once, and taken on the next read.
// The agent is scripted by words in the person's message: "accent" → tokens_propose; "facts" → store_facts; "logo" →
// logo_propose; "preview" → preview_build; "two" → store_facts and preview_build in one round; "expensive" → each model
// request costs 40¢ (else 2¢); anything else → one line and the end of the turn.
import http from 'node:http'
import { randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const BETA = 'managed-agents-2026-04-01'
const POLICY_AGENT = {
  model: { id: 'claude-haiku-5-5', effort: { type: 'medium' }, inference_geo: 'us' },
  multiagent: null,
  tools: [
    { type: 'agent_toolset_20260401', default_config: { enabled: true }, configs: [{ name: 'web_fetch', enabled: false }, { name: 'web_search', enabled: false }] },
    ...['store_facts', 'tokens_propose', 'logo_propose', 'preview_build'].map((name) => ({ type: 'custom', name, description: name, input_schema: { type: 'object' } })),
  ],
}
const POLICY_ENV = { type: 'cloud', networking: { type: 'limited', allowed_hosts: ['api.frrata.shop'], allow_package_managers: false, allow_mcp_servers: false } }
const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><path d="M0 0h10v20H0z"/><path d="M14 0h10l-10 20z"/></svg>'

export function startFakeAnthropic({ port = 0, key = 'sk-ant-fake' } = {}) {
  const state = {
    requests: [], vaults: new Map(), files: new Map(), sessions: new Map(),
    /** Tests may change the live agent or environment to check `agentMatches`. */
    agent: structuredClone(POLICY_AGENT), env: structuredClone(POLICY_ENV),
    /** Tests may make the next N calls of a path fail (e.g. { 'POST /v1/vaults': 1 }). */
    failNext: {},
    /** The next N person messages are listed queued (processed_at null) once, then taken on the next events read. */
    queueNext: 0,
  }
  let clock = Date.now()
  const at = () => new Date(++clock).toISOString()
  const id = (p) => `${p}_${randomBytes(9).toString('hex')}`

  function push(s, ev) { const t = at(); const e = { id: id('sevt'), created_at: t, processed_at: t, ...ev }; s.events.push(e); return e }
  function costOf(s) { return s.expensive ? 40 : 2 }
  /** One model request, if the budget allows it: false when the session pauses at its budget. */
  function modelRequest(s) {
    if (s.listCost >= s.budget) { s.paused = true; push(s, { type: 'session.status_idle', stop_reason: { type: 'budget_reached' } }); return false }
    s.listCost += costOf(s)
    push(s, { type: 'span.model_request_end', is_error: false, model_request_start_id: id('sevt'), model_usage: { input_tokens: 5000, output_tokens: 800, cache_read_input_tokens: 80000, cache_creation_input_tokens: 2400 } })
    return true
  }
  function think(s, text) {
    s.work = { kind: 'message', text }
    push(s, { type: 'session.status_running' })
    if (!modelRequest(s)) return
    const w = text.toLowerCase(), calls = []
    if (w.includes('two')) calls.push(['store_facts', {}], ['preview_build', {}])
    else if (w.includes('accent')) calls.push(['tokens_propose', { palette: { accent: '#7A2A1E' } }])
    else if (w.includes('logo')) calls.push(['logo_propose', { svg: LOGO }])
    else if (w.includes('preview')) calls.push(['preview_build', {}])
    else if (w.includes('facts')) calls.push(['store_facts', {}])
    if (!calls.length) { finish(s, 'Done.'); return }
    s.pending = calls.map(([name, input]) => push(s, { type: 'agent.custom_tool_use', name, input }).id)
    s.round += 1
    push(s, { type: 'session.status_idle', stop_reason: { type: 'requires_action', event_ids: [...s.pending] } })
  }
  function finish(s, text) {
    push(s, { type: 'agent.message', content: [{ type: 'text', text }] })
    s.work = null
    push(s, { type: 'session.status_idle', stop_reason: { type: 'end_turn' } })
  }
  function afterResults(s) {
    if (s.pending.length) { push(s, { type: 'session.status_idle', stop_reason: { type: 'requires_action', event_ids: [...s.pending] } }); s.extraIdles += 1; return }
    push(s, { type: 'session.status_running' })
    if (!modelRequest(s)) return
    finish(s, 'I proposed a change you can apply.')
  }

  const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(body === undefined ? '' : JSON.stringify(body)) }
  const bad = (res, code, type, message) => send(res, code, { type: 'error', error: { type, message } })

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x')
    const chunks = []
    for await (const c of req) chunks.push(c)
    const raw = Buffer.concat(chunks)
    const ctype = String(req.headers['content-type'] ?? '')
    let body = {}
    if (ctype.includes('application/json') && raw.length) { try { body = JSON.parse(raw.toString('utf8')) } catch { return bad(res, 400, 'invalid_request_error', 'json') } }
    const route = `${req.method} ${url.pathname}`
    const keyOk = req.headers['x-api-key'] === key || req.headers.authorization === `Bearer ${key}`
    state.requests.push({ route, query: Object.fromEntries(url.searchParams), body, headers: { beta: req.headers['anthropic-beta'] ?? '', key: keyOk } })
    if (!keyOk) return bad(res, 401, 'authentication_error', 'key')
    const betas = String(req.headers['anthropic-beta'] ?? '')
    const isFiles = url.pathname.startsWith('/v1/files')
    if (!isFiles && !betas.includes(BETA)) return bad(res, 400, 'invalid_request_error', 'beta')
    const failKey = `${req.method} ${url.pathname.replace(/\/(sesn|vlt|file|agent|env)_[0-9a-f]+/g, '/$1_*')}`
    if (state.failNext[failKey] > 0) { state.failNext[failKey] -= 1; return bad(res, 500, 'api_error', 'planned failure') }

    let m
    if (req.method === 'GET' && (m = url.pathname.match(/^\/v1\/agents\/([\w-]+)$/))) return send(res, 200, { id: m[1], type: 'agent', version: Number(url.searchParams.get('version') ?? 1), name: 'frrata-agent', ...state.agent })
    if (req.method === 'GET' && (m = url.pathname.match(/^\/v1\/environments\/([\w-]+)$/))) return send(res, 200, { id: m[1], type: 'environment', config: state.env })
    if (route === 'POST /v1/vaults') { const v = { id: id('vlt'), credentials: [] }; state.vaults.set(v.id, v); return send(res, 200, { id: v.id, type: 'vault' }) }
    if (req.method === 'POST' && (m = url.pathname.match(/^\/v1\/vaults\/(vlt_\w+)\/credentials$/))) {
      const v = state.vaults.get(m[1]); if (!v) return bad(res, 404, 'not_found_error', 'vault')
      v.credentials.push(body); return send(res, 200, { id: id('vcrd'), type: 'credential' })
    }
    if (req.method === 'DELETE' && (m = url.pathname.match(/^\/v1\/vaults\/(vlt_\w+)$/))) {
      if (!state.vaults.delete(m[1])) return bad(res, 404, 'not_found_error', 'vault'); return send(res, 200, { id: m[1], type: 'vault_deleted' })
    }
    if (route === 'POST /v1/files') { const f = { id: id('file'), bytes: raw.length }; state.files.set(f.id, f); return send(res, 200, { id: f.id, type: 'file', size_bytes: f.bytes }) }
    if (req.method === 'DELETE' && (m = url.pathname.match(/^\/v1\/files\/(file_\w+)$/))) {
      if (!state.files.delete(m[1])) return bad(res, 404, 'not_found_error', 'file'); return send(res, 200, { id: m[1], type: 'file_deleted' })
    }
    if (route === 'POST /v1/sessions') {
      const amount = Number(body?.budget?.max_list_cost?.amount)
      if (!(amount > 0)) return bad(res, 400, 'invalid_request_error', 'budget required')
      const s = { id: id('sesn'), budget: amount, listCost: 0, events: [], pending: [], round: 0, extraIdles: 0, paused: false, work: null, archived: false, vault_ids: body.vault_ids ?? [], resources: body.resources ?? [], agent: body.agent, expensive: false, messages: 0 }
      state.sessions.set(s.id, s)
      push(s, { type: 'session.status_idle', stop_reason: { type: 'end_turn' } })
      return send(res, 200, { id: s.id, type: 'session', status: 'idle' })
    }
    if ((m = url.pathname.match(/^\/v1\/sessions\/(sesn_\w+)(\/events|\/archive)?$/))) {
      const s = state.sessions.get(m[1]); if (!s) return bad(res, 404, 'not_found_error', 'session')
      if (req.method === 'GET' && !m[2]) return send(res, 200, { id: s.id, type: 'session', status: s.work ? (s.paused || s.pending.length ? 'idle' : 'running') : 'idle', usage: { list_cost: { amount: String(s.listCost), currency: 'USD' } } })
      if (req.method === 'DELETE' && !m[2]) { state.sessions.delete(s.id); return send(res, 200, { id: s.id, type: 'session_deleted' }) }
      if (req.method === 'POST' && m[2] === '/archive') { s.archived = true; return send(res, 200, { id: s.id, type: 'session' }) }
      if (req.method === 'POST' && !m[2]) {
        if (body.budget === undefined) return send(res, 200, { id: s.id, type: 'session' })
        const amount = Number(body?.budget?.max_list_cost?.amount)
        if (!(amount > s.listCost)) return bad(res, 400, 'invalid_request_error', 'budget_not_raised')
        s.budget = amount
        if (s.paused && s.work) { s.paused = false; const w = s.work; if (w.kind === 'message') think(s, w.text) }
        else s.paused = false
        return send(res, 200, { id: s.id, type: 'session' })
      }
      if (req.method === 'GET' && m[2] === '/events') {
        const since = url.searchParams.get('created_at[gte]')
        const limit = Math.min(Number(url.searchParams.get('limit') ?? 100) || 100, 1000)
        const data = s.events.filter((e) => !since || e.created_at >= since).slice(0, limit).map((e) => ({ ...e }))
        // A queued message is taken after this read lists it: processed now, and the agent starts.
        if (s.queued) { const q = s.queued; s.queued = null; q.ev.processed_at = at(); think(s, q.text) }
        return send(res, 200, { data, next_page: null })
      }
      if (req.method === 'POST' && m[2] === '/events') {
        const events = Array.isArray(body.events) ? body.events : []
        const settle = new Set(['user.tool_confirmation', 'user.tool_result', 'user.custom_tool_result', 'user.interrupt'])
        if (s.paused && events.some((e) => !settle.has(e.type))) return bad(res, 400, 'invalid_request_error', 'budget_reached: only settle events')
        for (const e of events) {
          if (e.type === 'user.message') {
            const text = (e.content ?? []).map((b) => b.text ?? '').join('\n')
            s.messages += 1
            if (text.toLowerCase().includes('expensive')) s.expensive = true
            const ev = push(s, { type: 'user.message', content: e.content })
            if (state.queueNext > 0) { state.queueNext -= 1; ev.processed_at = null; s.queued = { ev, text } } else think(s, text)
          } else if (e.type === 'user.custom_tool_result') {
            if (!s.pending.includes(e.custom_tool_use_id)) return bad(res, 400, 'invalid_request_error', 'no such pending call')
            s.pending = s.pending.filter((x) => x !== e.custom_tool_use_id)
            push(s, { type: 'user.custom_tool_result', custom_tool_use_id: e.custom_tool_use_id, is_error: !!e.is_error })
          } else if (e.type === 'user.interrupt') {
            if (s.paused) continue // accepted and ignored at the budget (docs)
            s.pending = []; s.work = null
            push(s, { type: 'session.status_idle', stop_reason: { type: 'end_turn' } })
          }
        }
        if (events.some((e) => e.type === 'user.custom_tool_result')) afterResults(s)
        return send(res, 200, { data: [] })
      }
    }
    return bad(res, 404, 'not_found_error', route)
  })
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => {
    const { port: p } = server.address()
    resolve({ url: `http://127.0.0.1:${p}`, key, state, close: () => new Promise((r) => server.close(() => r())) })
  }))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const f = await startFakeAnthropic({ port: Number(process.env.PORT), key: process.env.KEY || 'sk-ant-fake' })
  console.log(`fake anthropic on ${f.url}`)
}
