import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { startFakeAnthropic } from '../../../../e2e/fakes/anthropic.mjs'
import type { StudioRuntime } from '../runtime'

// The runtime adapter against the fake Managed Agents server (plan docs/plans/2026-11-22-v3a-runtime.md R3): never the
// live API. The env module reads its settings at import, so they are set first and the modules imported after.

type Fake = { url: string; key: string; state: { requests: { route: string; body: Record<string, unknown>; headers: { beta: string; key: boolean } }[]; vaults: Map<string, { credentials: Record<string, unknown>[] }>; sessions: Map<string, { budget: number; listCost: number; extraIdles: number; resources: unknown[]; vault_ids: string[] }>; agent: Record<string, unknown>; failNext: Record<string, number> }; close: () => Promise<void> }
let fake: Fake
let rt: StudioRuntime

beforeAll(async () => {
  fake = await startFakeAnthropic({ key: 'sk-ant-test-runtime' })
  process.env.STUDIO_ANTHROPIC_KEY = fake.key
  process.env.STUDIO_ANTHROPIC_BASE = fake.url
  process.env.STUDIO_AGENT_ID = 'agent_0123'
  process.env.STUDIO_AGENT_VERSION = '3'
  process.env.STUDIO_ENVIRONMENT_ID = 'env_0123'
  vi.resetModules()
  rt = (await import('../runtime-managed')).managedRuntime
})
afterAll(async () => { await fake.close() })

const last = (route: string) => [...fake.state.requests].reverse().find((r) => r.route.startsWith(route))!

describe('the Managed Agents runtime (against the fake)', () => {
  it('sends the key and the beta header on every call', async () => {
    expect(await rt.agentMatches()).toBe(true)
    for (const r of fake.state.requests) { expect(r.headers.key).toBe(true); expect(r.headers.beta).toContain('managed-agents-2026-04-01') }
  })

  it('refuses a live agent that differs from the policy (model, geo, web tools, tools)', async () => {
    const before = structuredClone(fake.state.agent)
    ;(fake.state.agent.model as { inference_geo: string }).inference_geo = 'global'
    expect(await rt.agentMatches()).toBe(false)
    fake.state.agent = structuredClone(before)
    ;(fake.state.agent.tools as { configs?: { name: string; enabled: boolean }[] }[])[0]!.configs = [{ name: 'web_fetch', enabled: true }]
    expect(await rt.agentMatches()).toBe(false)
    fake.state.agent = before
    expect(await rt.agentMatches()).toBe(true)
  })

  it('puts the build key in a vault as a header-only credential for api.frrata.shop', async () => {
    const vault = await rt.createVault('frs_build_secretvalue')
    const v = fake.state.vaults.get(vault)!
    const auth = (v.credentials[0] as { auth: Record<string, unknown> }).auth
    expect(auth).toMatchObject({ type: 'environment_variable', secret_name: 'FRRATA_KEY', secret_value: 'frs_build_secretvalue', injection_location: { header: true }, networking: { type: 'limited', allowed_hosts: ['api.frrata.shop'] } })
    await rt.deleteVault(vault)
    expect(fake.state.vaults.has(vault)).toBe(false)
    await expect(rt.deleteVault(vault)).resolves.toBeUndefined() // already gone is fine
  })

  it('deletes the vault when its credential cannot be stored', async () => {
    const n = fake.state.vaults.size
    fake.state.failNext['POST /v1/vaults/vlt_*/credentials'] = 1
    await expect(rt.createVault('frs_build_x')).rejects.toMatchObject({ name: 'RuntimeError', code: 'unavailable' })
    expect(fake.state.vaults.size).toBe(n)
  })

  it('creates a session only with a budget, pinned to the agent version, with the vault', async () => {
    await expect(rt.start({ title: 't', budgetCents: 0, vaultId: 'vlt_x', fileId: null })).rejects.toMatchObject({ code: 'budget' })
    const vault = await rt.createVault('frs_build_y')
    const id = await rt.start({ title: 'Kesar', budgetCents: 38, vaultId: vault, fileId: null })
    const body = last('POST /v1/sessions').body
    expect(body).toMatchObject({ agent: { type: 'agent', id: 'agent_0123', version: 3 }, environment_id: 'env_0123', vault_ids: [vault], budget: { type: 'limit', max_list_cost: { amount: '38', currency: 'USD' } } })
    expect(fake.state.sessions.get(id)!.budget).toBe(38)
  })

  it('a turn with one round of calls: events in order, answered in one send, then the end', async () => {
    const vault = await rt.createVault('frs_build_z')
    const id = await rt.start({ title: 'Kesar', budgetCents: 50, vaultId: vault, fileId: null })
    await rt.send(id, 'Show me two things')
    let evs = await rt.events(id, null, 100)
    const idle = evs.filter((e) => e.kind === 'idle').at(-1)!
    expect(idle).toMatchObject({ kind: 'idle', stop: 'requires_action' })
    const calls = evs.filter((e) => e.kind === 'tool_use')
    expect(calls.map((c) => (c as { name: string }).name)).toEqual(['store_facts', 'preview_build'])
    expect((idle as { pending: string[] }).pending).toEqual(calls.map((c) => c.id))
    await rt.answer(id, calls.map((c) => ({ toolUseId: c.id, text: '{}', isError: false })))
    evs = await rt.events(id, idle.at, 100)
    expect(evs.map((e) => e.kind)).toContain('agent_message')
    expect(evs.filter((e) => e.kind === 'idle').at(-1)).toMatchObject({ stop: 'end_turn' })
    expect(fake.state.sessions.get(id)!.extraIdles).toBe(0)
    const cost = evs.find((e) => e.kind === 'request_end') as { cost: number }
    expect(cost.cost).toBeGreaterThan(0)
    expect((await rt.usage(id)).listCost).toBe(40_000) // 2 requests × 2¢
  })

  it('a budget is raised, never to what is spent; at the budget the session pauses', async () => {
    const vault = await rt.createVault('frs_build_b')
    const id = await rt.start({ title: 'Kesar', budgetCents: 30, vaultId: vault, fileId: null })
    await rt.send(id, 'make it expensive and warmer accent')
    let evs = await rt.events(id, null, 100)
    const call = evs.find((e) => e.kind === 'tool_use')!
    await rt.answer(id, [{ toolUseId: call.id, text: '{}', isError: false }])
    evs = await rt.events(id, null, 100)
    expect(evs.filter((e) => e.kind === 'idle').at(-1)).toMatchObject({ stop: 'budget_reached' })
    await expect(rt.send(id, 'next')).rejects.toMatchObject({ code: 'refused' }) // only settle events at the cap
    await expect(rt.setBudget(id, 40)).rejects.toMatchObject({ code: 'refused' }) // not above what is spent
    await rt.setBudget(id, 200)
    await rt.interrupt(id)
    await rt.send(id, 'hello')
    evs = await rt.events(id, null, 200)
    expect(evs.filter((e) => e.kind === 'idle').at(-1)).toMatchObject({ stop: 'end_turn' })
  })

  it('a session is archived and deleted; gone is fine', async () => {
    const vault = await rt.createVault('frs_build_c')
    const id = await rt.start({ title: 'Kesar', budgetCents: 10, vaultId: vault, fileId: null })
    await rt.archive(id)
    await rt.remove(id)
    await expect(rt.remove(id)).resolves.toBeUndefined()
    await expect(rt.events(id, null, 10)).rejects.toMatchObject({ code: 'not_found' })
  })

  it('a vendor failure is our code, never its words', async () => {
    fake.state.failNext['POST /v1/vaults'] = 1
    const err = await rt.createVault('frs_build_d').catch((e: Error) => e)
    expect(err).toMatchObject({ name: 'RuntimeError', code: 'unavailable', message: 'unavailable' })
  })
})
