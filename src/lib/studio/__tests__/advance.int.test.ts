// Studio's advance on a real Postgres and the fake Anthropic server (plan docs/plans/2026-11-22-v3a-runtime.md R5;
// never the live API). Skipped unless INT_DB_HOST is set, as in CI. A throwaway store, partner and staff person with real
// step-ups are made as the superuser (the session's runtime row and its open turn too: their definers belong to
// sessions.ts, R6); then everything runs as frata_app and frata_builder through advance → asTurn → the tools.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { startFakeAnthropic } from '../../../../e2e/fakes/anthropic.mjs'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'

type Su = import('postgres').Sql
type Fake = { url: string; key: string; state: { requests: { route: string; body: Record<string, unknown> }[] }; close: () => Promise<void> }

describe.skipIf(!host)('advance: a turn through asTurn and the tools', () => {
  let su: Su, fake: Fake
  let mod: typeof import('../advance'), rt: import('../runtime').StudioRuntime
  const stamp = Date.now().toString(36)
  const ids = { tenant: '', partner: '', member: '', user: '', staffStepup: '', partnerStepup: '', session: '', runtime: '' }

  /** A turn on the session, as app_studio_open_turn would write it (its reserve 50¢ on today's India day). */
  async function openTurn(): Promise<string> {
    const [t] = await su<[{ id: string }]>`insert into studio_turns (tenant_id, partner_id, session_id) values (${ids.tenant}, ${ids.partner}, ${ids.session}) returning id`
    await su`insert into studio_turn_keys (turn_id, user_id, staff_stepup_id, partner_stepup_id) values (${t.id}, ${ids.user}, ${ids.staffStepup}, ${ids.partnerStepup})`
    await su`insert into studio_spend_turns (turn_id, day, user_id, reserved_micro) values (${t.id}, to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD'), ${ids.user}, 500000)`
    return t.id
  }
  const turnRow = async (id: string) => (await su`select started_at, ended_at, paused_at, failed_at, failed_reason from studio_turns where id = ${id}`)[0]!
  const ref = (turnId: string) => ({ tenantId: ids.tenant, turnId })

  beforeAll(async () => {
    fake = await startFakeAnthropic({ key: 'sk-ant-int-advance' }) as Fake
    Object.assign(process.env, {
      DATABASE_URL: `postgresql://frata_app:${pass}@${host}/${dbName}`,
      DATABASE_URL_BUILDER: `postgresql://frata_builder:${pass}@${host}/${dbName}`,
      STUDIO_ANTHROPIC_KEY: fake.key, STUDIO_ANTHROPIC_BASE: fake.url, STUDIO_OPEN: 'staff',
      STUDIO_AGENT_ID: 'agent_0123', STUDIO_AGENT_VERSION: '3', STUDIO_ENVIRONMENT_ID: 'env_0123',
    })
    vi.resetModules()
    const { default: postgres } = await import('postgres')
    su = postgres(process.env.ADMIN_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 2, onnotice: () => {} })
    const [u] = await su<[{ u: string; sess: string }]>`select gen_random_uuid() as u, gen_random_uuid() as sess`
    ids.user = u.u
    const browser = u.sess
    const [t] = await su<[{ id: string }]>`insert into tenants (slug, name) values (${'int-studio-' + stamp}, 'Int Studio') returning id`
    ids.tenant = t.id
    const [p] = await su<[{ id: string }]>`insert into partners (user_id, email, name, phone, city, brands_now, terms_version, agreed_at, approved_at)
      values (${ids.user}, ${stamp + '@int.test'}, 'Int P', '919800000101', 'Jaipur', '0', 1, now(), now()) returning id`
    ids.partner = p.id
    const [pm] = await su<[{ id: string }]>`insert into partner_members (partner_id, user_id, email, role, accepted_at) values (${ids.partner}, ${ids.user}, ${stamp + '@int.test'}, 'owner', now()) returning id`
    ids.member = pm.id
    await su`insert into partner_links (tenant_id, partner_id, share_bps, share_months, notice_days) values (${ids.tenant}, ${ids.partner}, 2000, 24, 90)`
    await su`insert into members (tenant_id, user_id, role, partner_member_id) values (${ids.tenant}, ${ids.user}, 'partner', ${ids.member})`
    await su`insert into platform_staff (user_id, email, role) values (${ids.user}, ${stamp + '@int.test'}, 'support')`
    const [sk] = await su<[{ id: string }]>`insert into staff_passkeys (user_id, credential_id, public_key, name) values (${ids.user}, ${'int-' + stamp}, 'k', 'Int') returning id`
    const [ss] = await su<[{ id: string }]>`insert into staff_stepups (user_id, session_id, passkey_id, token_hash, expires_at) values (${ids.user}, ${browser}, ${sk.id}, ${'sh-' + stamp}, now() + interval '1 hour') returning id`
    ids.staffStepup = ss.id
    const [pk] = await su<[{ id: string }]>`insert into partner_passkeys (partner_member_id, user_id, credential_id, public_key, name) values (${ids.member}, ${ids.user}, ${'intp-' + stamp}, 'k', 'Int') returning id`
    const [ps] = await su<[{ id: string }]>`insert into partner_stepups (partner_member_id, user_id, session_id, passkey_id, token_hash, expires_at) values (${ids.member}, ${ids.user}, ${browser}, ${pk.id}, ${'ph-' + stamp}, now() + interval '1 hour') returning id`
    ids.partnerStepup = ps.id
    const [prod] = await su<[{ id: string }]>`insert into products (tenant_id, handle, title, options, status, hsn) values (${ids.tenant}, ${'kurta-' + stamp}, 'Indigo kurta', '{Size}', 'active', '6109') returning id`
    await su`insert into variants (tenant_id, product_id, option_values, price, stock) values (${ids.tenant}, ${prod.id}, '{M}', 149900, 7)`

    rt = (await import('../runtime-managed')).managedRuntime
    mod = await import('../advance')
    const vault = await rt.createVault('frs_build_int')
    ids.runtime = await rt.start({ title: 'Int', budgetCents: 50, vaultId: vault, fileId: null })
    const [s] = await su<[{ id: string }]>`insert into studio_sessions (tenant_id, partner_id, partner_member_id, user_id, runtime_id, vault_id)
      values (${ids.tenant}, ${ids.partner}, ${ids.member}, ${ids.user}, ${ids.runtime}, ${vault}) returning id`
    ids.session = s.id
    await su`insert into studio_spend_sessions (session_id) values (${ids.session})`
  })
  afterAll(async () => {
    if (ids.tenant) await su`update studio_sessions set ended_at = now(), end_reason = 'stopped' where tenant_id = ${ids.tenant} and ended_at is null`
    await su?.end(); await fake?.close()
  })

  it('one round of two calls: run as the turn, answered in one send, then the turn ends and settles', async () => {
    const turn = await openTurn()
    expect(await mod.advance(ref(turn))).toBe('waiting') // nothing sent yet: the turn has not started
    await rt.send(ids.runtime, 'Show me two things')
    const sends = () => fake.state.requests.filter((r) => r.route.endsWith('/events') && r.route.startsWith('POST') && JSON.stringify(r.body).includes('custom_tool_result')).length
    const before = sends()
    expect(await mod.advance(ref(turn))).toBe('answered')
    expect(sends() - before).toBe(1) // both calls in ONE send
    const calls = await su`select name, result, is_error, answered_at from studio_tool_calls where session_id = ${ids.session} order by name`
    expect(calls.map((c) => c.name)).toEqual(['preview_build', 'store_facts'])
    expect(calls.every((c) => c.answered_at !== null)).toBe(true)
    const facts = JSON.stringify(calls[1]!.result)
    expect(facts).toContain('Indigo kurta')
    expect(facts).not.toMatch(/stock|cost|cogs|order|email|phone/i)
    expect(calls[0]).toMatchObject({ is_error: true, result: { error: 'This is not available yet. Tell the person so.' } })
    expect(await mod.advance(ref(turn))).toBe('ended')
    const tr = await turnRow(turn)
    expect(tr.ended_at).not.toBeNull()
    const [spend] = await su`select measured_micro, settled_at from studio_spend_turns where turn_id = ${turn}`
    expect(Number(spend!.measured_micro)).toBe(40_000) // two requests × 2¢, measured, uncapped
    expect(await su`select 1 from studio_turn_keys where turn_id = ${turn}`).toHaveLength(0)
    const lines = await su`select kind, text from studio_messages where session_id = ${ids.session} and kind = 'agent'`
    expect(lines.map((l) => l.text)).toContain('I proposed a change you can apply.')
  })

  it('a last turn’s end never closes the next turn; a proposal is stored once, with its card', async () => {
    const turn = await openTurn()
    expect(await mod.advance(ref(turn))).toBe('waiting') // the cursor re-reads the last turn's end_turn: ignored
    expect((await turnRow(turn)).ended_at).toBeNull()
    await rt.send(ids.runtime, 'a warmer accent please')
    expect(await mod.advance(ref(turn))).toBe('answered')
    // A second advance over the same events makes no second copy.
    await su`update studio_sessions set event_cursor = null where id = ${ids.session}`
    expect(await mod.advance(ref(turn))).toBe('ended')
    const props = await su`select kind, value from studio_proposals where session_id = ${ids.session}`
    expect(props).toHaveLength(1)
    expect(props[0]).toMatchObject({ kind: 'tokens', value: { palette: { accent: '#7A2A1E' } } })
    expect(await su`select 1 from studio_messages where session_id = ${ids.session} and kind = 'card'`).toHaveLength(1)
  })

  it('signed out mid-turn: nothing runs, the turn is the cron’s to end', async () => {
    const turn = await openTurn()
    await rt.send(ids.runtime, 'facts please')
    await su`update partner_stepups set expires_at = now() - interval '1 second' where id = ${ids.partnerStepup}`
    try {
      expect(await mod.advance(ref(turn))).toBe('actor')
      expect(await su`select 1 from studio_tool_calls where turn_id = ${turn}`).toHaveLength(0)
    } finally {
      await su`update partner_stepups set expires_at = now() + interval '1 hour' where id = ${ids.partnerStepup}`
    }
    // Back: the round runs and the turn ends.
    expect(await mod.advance(ref(turn))).toBe('answered')
    expect(await mod.advance(ref(turn))).toBe('ended')
  })

  it('a lease is one advance a session; a second at once is busy', async () => {
    const turn = await openTurn()
    await rt.send(ids.runtime, 'hello')
    const [a, b] = await Promise.all([mod.advance(ref(turn)), mod.advance(ref(turn))])
    expect([a, b].sort()).toEqual(['busy', 'ended'])
  })

  it('another store’s advance of this turn binds nothing and writes nothing', async () => {
    const [b] = await su<[{ id: string }]>`insert into tenants (slug, name) values (${'int-studio-b-' + stamp}, 'Int Studio B') returning id`
    const turn = await openTurn()
    await rt.send(ids.runtime, 'facts please')
    const before = await su`select count(*)::int as n from studio_tool_calls where session_id = ${ids.session}`
    expect(await mod.advance({ tenantId: b.id, turnId: turn })).toBe('actor')
    expect(await su`select count(*)::int as n from studio_tool_calls where session_id = ${ids.session}`).toEqual(before)
    expect((await su`select advancing_until from studio_sessions where id = ${ids.session}`)[0]!.advancing_until).toBeNull()
    // This store's advance carries on.
    expect(await mod.advance(ref(turn))).toBe('answered')
    expect(await mod.advance(ref(turn))).toBe('ended')
  })

  it('an answer that fails to send is sent again with the stored results; the call is not run twice', async () => {
    const turn = await openTurn()
    await rt.send(ids.runtime, 'facts please')
    ;(fake.state as unknown as { failNext: Record<string, number> }).failNext['POST /v1/sessions/sesn_*/events'] = 1
    expect(await mod.advance(ref(turn))).toBe('error')
    const [first] = await su`select executed_at, answered_at, result from studio_tool_calls where turn_id = ${turn}`
    expect(first!.executed_at).not.toBeNull()
    expect(first!.answered_at).toBeNull() // kept until its send succeeds
    expect(await mod.advance(ref(turn))).toBe('answered')
    const [again] = await su`select executed_at, answered_at, result from studio_tool_calls where turn_id = ${turn}`
    expect(again!.executed_at).toEqual(first!.executed_at)
    expect(again!.result).toEqual(first!.result)
    expect(again!.answered_at).not.toBeNull()
    expect(await mod.advance(ref(turn))).toBe('ended')
  })

  it('model data the database would refuse (NUL, an input that grows as jsonb) never sticks the session', async () => {
    type Ev = Record<string, unknown> & { type: string; input?: unknown }
    const sess = () => (fake.state as unknown as { sessions: Map<string, { events: Ev[] }> }).sessions.get(ids.runtime)!
    let turn = await openTurn()
    await rt.send(ids.runtime, 'facts please')
    const call = [...sess().events].reverse().find((x) => x.type === 'agent.custom_tool_use')!
    call.input = { note: 'a\u0000b' }
    const line = [...sess().events].reverse().find((x) => x.type === 'session.status_idle')!
    sess().events.splice(sess().events.indexOf(line), 0, { id: 'sevt_nul_line', type: 'agent.message', created_at: line.created_at, processed_at: line.processed_at, content: [{ type: 'text', text: 'x\u0000y' }] })
    expect(await mod.advance(ref(turn))).toBe('answered')
    const [c] = await su`select input, is_error from studio_tool_calls where turn_id = ${turn}`
    expect(c!.input).toEqual({ note: 'ab' }) // NUL dropped; store_facts takes no input, so it is refused unrun
    expect(c!.is_error).toBe(true)
    expect((await su`select text from studio_messages where event_id = 'sevt_nul_line'`)[0]?.text).toBe('xy')
    expect(await mod.advance(ref(turn))).toBe('ended')

    turn = await openTurn()
    await rt.send(ids.runtime, 'facts please')
    ;[...sess().events].reverse().find((x) => x.type === 'agent.custom_tool_use')!.input = { n: Array.from({ length: 30_000 }, () => 0) }
    expect(await mod.advance(ref(turn))).toBe('answered')
    const [big] = await su`select input, result from studio_tool_calls where turn_id = ${turn}`
    expect(big).toMatchObject({ input: {}, result: { error: 'The input did not match the tool. Fix it and call again. Nothing was changed.' } })
    expect(await mod.advance(ref(turn))).toBe('ended')
  })

  it('a queued message opens the turn only once the runtime takes it; the cursor never passes it', async () => {
    const turn = await openTurn()
    ;(fake.state as unknown as { queueNext: number }).queueNext = 1
    await rt.send(ids.runtime, 'facts please')
    expect(await mod.advance(ref(turn))).toBe('waiting') // listed queued: not this turn's start yet
    expect((await turnRow(turn)).started_at).toBeNull()
    const [cur] = await su`select event_cursor from studio_sessions where id = ${ids.session}`
    expect(cur!.event_cursor).toBeTruthy()
    expect(await mod.advance(ref(turn))).toBe('answered')
    expect(await mod.advance(ref(turn))).toBe('ended')
  })

  it('at the budget the turn pauses and settles what was measured', async () => {
    const turn = await openTurn()
    await rt.send(ids.runtime, 'make it expensive with a warmer accent')
    let out = await mod.advance(ref(turn))
    for (let i = 0; i < 3 && out !== 'paused'; i++) out = await mod.advance(ref(turn))
    expect(out).toBe('paused')
    expect((await turnRow(turn)).paused_at).not.toBeNull()
    const [spend] = await su`select measured_micro from studio_spend_turns where turn_id = ${turn}`
    expect(Number(spend!.measured_micro)).toBeGreaterThan(0)
  })

  it('one frata_builder connection per advance, whatever the reads; none left after (the deadlock test)', async () => {
    const { withBuilderScope } = await import('@/lib/db/actor')
    const { builderStoreFacts } = await import('@/lib/queries/builder')
    const { builderActor } = await import('@/lib/db/actor')
    const count = async () => Number((await su`select count(*)::int as n from pg_stat_activity where usename = 'frata_builder' and datname = ${dbName}`)[0]!.n)
    let peak = 0
    await withBuilderScope(async () => {
      const a = builderActor(ids.tenant)
      const reads = Array.from({ length: 20 }, () => builderStoreFacts(a))
      peak = Math.max(peak, await count())
      const out = await Promise.all(reads)
      peak = Math.max(peak, await count())
      expect(out.every((o) => o.products.first.length === 1)).toBe(true)
    })
    expect(peak).toBeLessThanOrEqual(2) // the scope's one client (max 2), never one per read
    for (let i = 0; i < 20 && (await count()) > 0; i++) await new Promise((r) => setTimeout(r, 100))
    expect(await count()).toBe(0)
  }, 20_000)
})
