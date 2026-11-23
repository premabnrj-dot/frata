import 'server-only'
import Anthropic, { toFile } from '@anthropic-ai/sdk'
import { STUDIO_AGENT_ID, STUDIO_AGENT_VERSION, STUDIO_ENVIRONMENT_ID } from '@/lib/env'
import { errName } from '@/lib/log'
import { fromCents, requestCost, studioCaps } from '@/domains/studio/spend'
import { agentDifferences, environmentDifferences, API_HOST, KEY_VARIABLE } from '@/domains/studio/policy'
import type { MicroUsd } from '@/domains/money/usd'
import { CALL_MS, studioClient } from './client'
import { RuntimeError, type StartInput, type StudioEvent, type StudioRuntime, type ToolAnswer } from './runtime'

// =============================================================================
// FILE: src/lib/studio/runtime-managed.ts — STUDIO'S RUNTIME ON ANTHROPIC MANAGED AGENTS (ADR-0020 point 1; beta
// `managed-agents-2026-04-01`, set by the SDK on every `client.beta.*` call; bindings from SDK 1.12.0's types and the
// claude-api skill bundle). The agent and environment are made by `ant apply` from studio/agents/frrata-agent/ and
// named by id in env; a session pins that agent version. Every session is created WITH a budget (it can never be added
// later); the vault holds the build key as a header-only credential for exactly api.frrata.shop (spike: a URL query is
// never substituted, and an echoing host would hand the value back). Each call has its own deadline and no SDK retry.
// Failures become RuntimeError with our code; a vendor's message never leaves this file (it can quote content).
// =============================================================================

const BETA = { betas: ['managed-agents-2026-04-01' as const] }

function client(): Anthropic {
  const c = studioClient()
  if (!c) throw new RuntimeError('unconfigured')
  return c
}

/** A vendor failure as our code (logged by name and status only, never its words). */
function wrap(where: string, e: unknown): RuntimeError {
  if (e instanceof RuntimeError) return e
  const status = e instanceof Anthropic.APIError ? e.status : undefined
  console.error(`[studio.runtime.${where}]`, errName(e), status ?? '')
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new RuntimeError('timeout')
  if (status === 404) return new RuntimeError('not_found')
  if (status === 429) return new RuntimeError('limited')
  if (status === 400 || status === 409) return new RuntimeError('refused')
  return new RuntimeError('unavailable')
}

async function call<T>(where: string, fn: () => Promise<T>): Promise<T> {
  try { return await fn() } catch (e) { throw wrap(where, e) }
}

const textOf = (blocks: unknown): string => Array.isArray(blocks)
  ? blocks.filter((b): b is { type: 'text'; text: string } => !!b && (b as { type?: string }).type === 'text' && typeof (b as { text?: unknown }).text === 'string').map((b) => b.text).join('\n')
  : ''

/** One vendor event as ours. Unknown kinds are `other` (read past, never acted on). */
export function toStudioEvent(ev: Record<string, unknown>): StudioEvent {
  const id = String(ev.id ?? ''), at = String(ev.processed_at ?? '')
  switch (ev.type) {
    case 'user.message': return { id, at, kind: 'user_message' }
    case 'agent.custom_tool_use': return { id, at, kind: 'tool_use', name: String(ev.name ?? ''), input: ev.input ?? {} }
    case 'agent.message': return { id, at, kind: 'agent_message', text: textOf(ev.content) }
    case 'span.model_request_end': {
      const caps = studioCaps()
      const u = (ev.model_usage ?? {}) as Parameters<typeof requestCost>[0]
      return { id, at, kind: 'request_end', cost: caps ? requestCost(u, caps.rates) : (0 as MicroUsd) }
    }
    case 'session.status_idle': {
      const r = (ev.stop_reason ?? {}) as { type?: string; event_ids?: unknown }
      const stop = r.type === 'requires_action' || r.type === 'budget_reached' || r.type === 'refusal' || r.type === 'retries_exhausted' ? r.type : 'end_turn'
      return { id, at, kind: 'idle', stop, pending: Array.isArray(r.event_ids) ? r.event_ids.map(String) : [] }
    }
    case 'session.error': return { id, at, kind: 'error' }
    case 'session.status_terminated': return { id, at, kind: 'terminated' }
    default: return { id, at, kind: 'other' }
  }
}

export const managedRuntime: StudioRuntime = {
  async agentMatches() {
    if (!STUDIO_AGENT_ID || !STUDIO_AGENT_VERSION || !STUDIO_ENVIRONMENT_ID) return false
    const c = client()
    const [a, e] = await Promise.all([
      call('agent', () => c.beta.agents.retrieve(STUDIO_AGENT_ID, { version: STUDIO_AGENT_VERSION, ...BETA }, { timeout: CALL_MS.control })),
      call('environment', () => c.beta.environments.retrieve(STUDIO_ENVIRONMENT_ID, BETA, { timeout: CALL_MS.control })),
    ])
    const toolset = a.tools.find((t) => t.type === 'agent_toolset_20260401') as { configs?: { name: string; enabled?: boolean }[] } | undefined
    const on = (n: string) => toolset?.configs?.find((x) => x.name === n)?.enabled !== false
    const effort = a.model.effort as unknown
    const diffs = agentDifferences({
      model: a.model.id, effort: typeof effort === 'string' ? effort : (effort as { type?: string } | undefined)?.type ?? null, geo: a.model.inference_geo ?? null,
      webFetch: on('web_fetch'), webSearch: on('web_search'), multiagent: a.multiagent != null,
      customTools: a.tools.filter((t) => t.type === 'custom').map((t) => (t as { name: string }).name),
    })
    const net = (e.config as { networking?: { type?: string; allowed_hosts?: string[]; allow_package_managers?: boolean; allow_mcp_servers?: boolean } }).networking ?? {}
    const envDiffs = environmentDifferences({ networking: net.type ?? '', hosts: net.allowed_hosts ?? [], allowPackageManagers: !!net.allow_package_managers, allowMcpServers: !!net.allow_mcp_servers })
    if (diffs.length || envDiffs.length) console.error('[studio.runtime.agentMatches] differs:', [...diffs, ...envDiffs].join(', '))
    return !diffs.length && !envDiffs.length
  },

  async createVault(buildKey) {
    const c = client()
    const v = await call('vault', () => c.beta.vaults.create({ display_name: 'Studio session', ...BETA }, { timeout: CALL_MS.control }))
    try {
      await call('credential', () => c.beta.vaults.credentials.create(v.id, {
        display_name: `The store's build key, sent only to ${API_HOST} as its Frrata-Key header`,
        auth: { type: 'environment_variable', secret_name: KEY_VARIABLE, secret_value: buildKey, networking: { type: 'limited', allowed_hosts: [API_HOST] }, injection_location: { header: true } },
        ...BETA,
      } as never, { timeout: CALL_MS.control }))
    } catch (e) {
      await c.beta.vaults.delete(v.id, BETA, { timeout: CALL_MS.control }).catch(() => {})
      throw e
    }
    return v.id
  },

  async deleteVault(vaultId) {
    const c = client()
    await call('vault.delete', () => c.beta.vaults.delete(vaultId, BETA, { timeout: CALL_MS.control })).catch((e: RuntimeError) => { if (e.code !== 'not_found') throw e })
  },

  async uploadStarter(bytes, sha256) {
    const c = client()
    const f = await call('file', async () => c.beta.files.upload({ file: await toFile(bytes, `starter-0-${sha256.slice(0, 12)}.tgz`, { type: 'application/gzip' }), betas: ['files-api-2025-04-14'] }, { timeout: CALL_MS.control }))
    return f.id
  },

  async deleteFile(fileId) {
    const c = client()
    await call('file.delete', () => c.beta.files.delete(fileId, { betas: ['files-api-2025-04-14'] }, { timeout: CALL_MS.control })).catch((e: RuntimeError) => { if (e.code !== 'not_found') throw e })
  },

  async start(input: StartInput) {
    if (!(input.budgetCents > 0)) throw new RuntimeError('budget')
    if (!STUDIO_AGENT_ID || !STUDIO_AGENT_VERSION || !STUDIO_ENVIRONMENT_ID) throw new RuntimeError('unconfigured')
    const c = client()
    const s = await call('start', () => c.beta.sessions.create({
      agent: { type: 'agent', id: STUDIO_AGENT_ID, version: STUDIO_AGENT_VERSION },
      environment_id: STUDIO_ENVIRONMENT_ID,
      title: input.title.slice(0, 120),
      budget: { type: 'limit', max_list_cost: { amount: String(input.budgetCents), currency: 'USD' } },
      vault_ids: [input.vaultId],
      ...(input.fileId ? { resources: [{ type: 'file', file_id: input.fileId, mount_path: '/workspace/starter-0.tgz' }] } : {}),
      ...BETA,
    } as never, { timeout: CALL_MS.control }))
    return s.id
  },

  async setBudget(runtimeId, cents) {
    if (!(cents > 0)) throw new RuntimeError('budget')
    const c = client()
    await call('budget', () => c.beta.sessions.update(runtimeId, { budget: { type: 'limit', max_list_cost: { amount: String(cents), currency: 'USD' } }, ...BETA } as never, { timeout: CALL_MS.control }))
  },

  async send(runtimeId, text) {
    const c = client()
    await call('send', () => c.beta.sessions.events.send(runtimeId, { events: [{ type: 'user.message', content: [{ type: 'text', text }] }], ...BETA } as never, { timeout: CALL_MS.control }))
  },

  async answer(runtimeId, answers: ToolAnswer[]) {
    if (!answers.length) return
    const c = client()
    await call('answer', () => c.beta.sessions.events.send(runtimeId, {
      events: answers.map((a) => ({ type: 'user.custom_tool_result', custom_tool_use_id: a.toolUseId, content: [{ type: 'text', text: a.text }], ...(a.isError ? { is_error: true } : {}) })),
      ...BETA,
    } as never, { timeout: CALL_MS.control }))
  },

  async interrupt(runtimeId) {
    const c = client()
    await call('interrupt', () => c.beta.sessions.events.send(runtimeId, { events: [{ type: 'user.interrupt' }], ...BETA } as never, { timeout: CALL_MS.control }))
  },

  async events(runtimeId, since, limit) {
    const c = client()
    const page = await call('events', () => c.beta.sessions.events.list(runtimeId, { limit: Math.max(1, Math.min(limit, 200)), order: 'asc', ...(since ? { 'created_at[gte]': since } : {}), ...BETA } as never, { timeout: CALL_MS.events }))
    return (page.data as unknown as Record<string, unknown>[]).map(toStudioEvent)
  },

  async usage(runtimeId) {
    const c = client()
    const s = await call('usage', () => c.beta.sessions.retrieve(runtimeId, BETA, { timeout: CALL_MS.control }))
    const st = String((s as { status?: unknown }).status ?? '')
    return { listCost: fromCents((s.usage as { list_cost?: { amount?: string } | null } | undefined)?.list_cost?.amount), status: st === 'running' || st === 'idle' || st === 'terminated' ? st : 'other' }
  },

  async archive(runtimeId) {
    const c = client()
    await call('archive', () => c.beta.sessions.archive(runtimeId, BETA, { timeout: CALL_MS.control })).catch((e: RuntimeError) => { if (e.code !== 'not_found') throw e })
  },

  async remove(runtimeId) {
    const c = client()
    await call('remove', () => c.beta.sessions.delete(runtimeId, BETA, { timeout: CALL_MS.control })).catch((e: RuntimeError) => { if (e.code !== 'not_found') throw e })
  },
}
