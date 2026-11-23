// Send, start, Stop and the cron on a real Postgres and the fake Anthropic server (plan docs/plans/2026-11-22-v3a-runtime.md
// R6; never the live API). Skipped unless INT_DB_HOST is set, as in CI. Every failure step leaves no live key, no vault
// and no uncounted reserve once the cron has cleaned up; two first Sends at once make one session and one day row; a
// paused session's next Send raises, interrupts, then sends; age ends a session; 30 days after its end it is deleted.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { startFakeAnthropic } from '../../../../e2e/fakes/anthropic.mjs'
import { makeStudioStore, type StudioFixture } from './studio-fixture'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'

type FakeState = { requests: { route: string; body: Record<string, unknown> }[]; vaults: Map<string, unknown>; files: Map<string, unknown>; sessions: Map<string, { budget: number; archived: boolean }>; failNext: Record<string, number> }
type Fake = { url: string; key: string; state: FakeState; close: () => Promise<void> }

describe.skipIf(!host)('Studio sessions: Send, start, Stop, the cron', () => {
  let su: import('postgres').Sql, fake: Fake, f: StudioFixture
  let S: typeof import('../sessions'), rt: import('../runtime').StudioRuntime
  const stamp = 's' + Date.now().toString(36)
  const deps = () => ({ runtime: rt, starter: () => ({ bytes: new Uint8Array([1, 2, 3]), sha256: 'abc' }), follow: false })
  const cron = () => S.runStudioCron(Date.now() + 40_000, rt, f.tenant)
  const openSession = async () => (await su`select id, runtime_id, vault_id, file_id, build_key_id from studio_sessions where user_id = ${f.user} and ended_at is null`)[0]
  const reserved = async () => Number((await su`select coalesce(sum(reserved_micro), 0)::bigint as n from studio_spend_people where user_id = ${f.user}`)[0]!.n)
  const liveKeys = async () => Number((await su`select count(*)::int as n from storefront_keys where tenant_id = ${f.tenant} and kind = 'build' and revoked_at is null`)[0]!.n)

  beforeAll(async () => {
    fake = await startFakeAnthropic({ key: 'sk-ant-int-sessions' }) as Fake
    Object.assign(process.env, {
      DATABASE_URL: `postgresql://frata_app:${pass}@${host}/${dbName}`,
      DATABASE_URL_BUILDER: `postgresql://frata_builder:${pass}@${host}/${dbName}`,
      STUDIO_ANTHROPIC_KEY: fake.key, STUDIO_ANTHROPIC_BASE: fake.url, STUDIO_OPEN: 'staff',
      STUDIO_AGENT_ID: 'agent_0123', STUDIO_AGENT_VERSION: '3', STUDIO_ENVIRONMENT_ID: 'env_0123',
    })
    vi.resetModules()
    const { default: postgres } = await import('postgres')
    su = postgres(process.env.ADMIN_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 2, onnotice: () => {} })
    f = await makeStudioStore(su, stamp)
    // The platform's day cap is shared by every int run on this throwaway database: start this file under it.
    await su`update studio_spend_days set measured_micro = 0 where day = to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`
    rt = (await import('../runtime-managed')).managedRuntime
    S = await import('../sessions')
  })
  // The cron and the caps are platform-wide: this store's sessions end with the file, so a rerun on the same database
  // starts under the open-session cap.
  afterAll(async () => {
    if (f) await su`update studio_sessions set ended_at = now(), end_reason = 'stopped' where tenant_id = ${f.tenant} and ended_at is null`
    await su?.end(); await fake?.close()
  })

  it('the first Send: key minted and recorded, a vault holding it, Starter 0, a session with its budget; the cron ends the turn', async () => {
    const vaults = fake.state.vaults.size
    const r = await S.send(f.auth, 'hello there', deps())
    expect(r).toMatchObject({ ok: true })
    const s = (await openSession())!
    expect(s.runtime_id).toMatch(/^sesn_/)
    expect(s.vault_id).toMatch(/^vlt_/)
    expect(s.file_id).toMatch(/^file_/)
    expect(fake.state.vaults.size).toBe(vaults + 1)
    const [key] = await su`select purpose, created_by, expires_at > now() + interval '23 hours' as long from storefront_keys where id = ${s.build_key_id}`
    expect(key).toMatchObject({ purpose: 'session', created_by: f.user, long: true })
    expect(fake.state.sessions.get(s.runtime_id)!.budget).toBe(38) // $0.50 − the $0.12 floor, in cents
    expect(await su`select kind, text from studio_messages where session_id = ${s.id} and kind = 'person'`).toEqual([{ kind: 'person', text: 'hello there' }])
    // The key is in no request but the vault's credential…
    expect(JSON.stringify(fake.state.requests.filter((q) => !q.route.endsWith('/credentials')))).not.toContain('frs_build_')
    const cred = fake.state.requests.find((q) => q.route.endsWith('/credentials'))!
    expect(JSON.stringify(cred.body)).toContain('frs_build_') // …which is where it goes
    expect((await cron()).advanced).toBeGreaterThanOrEqual(1)
    expect((await su`select ended_at from studio_turns where id = ${(r as { turnId: string }).turnId}`)[0]!.ended_at).not.toBeNull()
  })

  it('the next Send raises the budget on the same session; a Send while a turn is open is refused', async () => {
    const s = (await openSession())!
    const before = fake.state.sessions.get(s.runtime_id)!.budget
    const r = await S.send(f.auth, 'facts please', deps())
    expect(r.ok).toBe(true)
    expect(fake.state.sessions.get(s.runtime_id)!.budget).toBeGreaterThan(before)
    expect(await S.send(f.auth, 'again', deps())).toEqual({ ok: false, why: 'turn_open' })
    expect((await openSession())!.id).toBe(s.id)
    await cron(); await cron()
    // The cron ran the round (its per-turn deadline leaves room for the answer) and the turn ended.
    expect((await su`select name, answered_at is not null as answered from studio_tool_calls where session_id = ${s.id}`)).toEqual([{ name: 'store_facts', answered: true }])
    expect((await su`select ended_at from studio_turns where id = ${(r as { turnId: string }).turnId}`)[0]!.ended_at).not.toBeNull()
  })

  it('Stop ends the session and its turn; the cron revokes the key, deletes the vault and file, archives the session', async () => {
    await S.send(f.auth, 'facts please', deps())
    const s = (await openSession())!
    expect((await S.stop(f.auth, rt)).ok).toBe(true)
    expect(await openSession()).toBeUndefined()
    const [ended] = await su`select end_reason from studio_sessions where id = ${s.id}`
    expect(ended!.end_reason).toBe('stopped')
    expect((await su`select failed_reason from studio_turns where session_id = ${s.id} order by sent_at desc limit 1`)[0]!.failed_reason).toBe('runtime')
    await cron()
    expect(await liveKeys()).toBe(0)
    expect(fake.state.vaults.has(s.vault_id)).toBe(false)
    expect(fake.state.files.has(s.file_id)).toBe(false)
    expect(fake.state.sessions.get(s.runtime_id)!.archived).toBe(true)
    expect((await su`select cleaned_at from studio_sessions where id = ${s.id}`)[0]!.cleaned_at).not.toBeNull()
    expect(await reserved()).toBe(0)
  })

  it('each failing start step leaves no live key, vault or uncounted reserve', async () => {
    for (const step of ['POST /v1/vaults', 'POST /v1/vaults/vlt_*/credentials', 'POST /v1/files', 'POST /v1/sessions', 'POST /v1/sessions/sesn_*/events']) {
      const vaults = fake.state.vaults.size
      fake.state.failNext[step] = 1
      const r = await S.send(f.auth, 'hello', deps())
      expect({ step, r }).toEqual({ step, r: { ok: false, why: step.endsWith('/events') ? 'send' : 'start' } })
      expect(await openSession()).toBeUndefined()
      await cron()
      expect({ step, keys: await liveKeys(), vaults: fake.state.vaults.size, reserved: await reserved() }).toEqual({ step, keys: 0, vaults, reserved: 0 })
      const [t] = await su`select t.failed_reason, x.settled_at is not null as settled from studio_turns t join studio_spend_turns x on x.turn_id = t.id
        join studio_sessions s on s.id = t.session_id where s.user_id = ${f.user} order by t.sent_at desc limit 1`
      expect({ step, t }).toEqual({ step, t: { failed_reason: step.endsWith('/events') ? 'send' : 'start', settled: true } })
    }
  })

  it('two first Sends at once: one session, one turn, one day row', async () => {
    const [a, b] = await Promise.all([S.send(f.auth, 'hello one', deps()), S.send(f.auth, 'hello two', deps())])
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1)
    expect([a, b].find((x) => !x.ok)).toMatchObject({ ok: false, why: expect.stringMatching(/^(busy|turn_open)$/) })
    expect(await su`select 1 from studio_sessions where user_id = ${f.user} and ended_at is null`).toHaveLength(1)
    expect(await su`select 1 from studio_spend_days where day = to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`).toHaveLength(1)
    await cron()
  })

  it('a paused session’s next Send raises the budget, interrupts, then sends', async () => {
    const s = (await openSession())!
    expect((await S.send(f.auth, 'make it expensive with a warmer accent', deps())).ok).toBe(true)
    for (let i = 0; i < 4; i++) await cron()
    expect((await su`select paused_at from studio_turns where session_id = ${s.id} order by sent_at desc limit 1`)[0]!.paused_at).not.toBeNull()
    const n = fake.state.requests.length
    const r = await S.send(f.auth, 'hello', deps())
    expect(r.ok).toBe(true) // the largest request (40¢) is under the 50¢ ceiling, so the margin holds
    const routes = fake.state.requests.slice(n).map((q) => `${q.route} ${JSON.stringify(q.body).includes('user.interrupt') ? 'interrupt' : ''}`)
    const raise = routes.findIndex((x) => /^POST \/v1\/sessions\/sesn_\w+ /.test(x))
    const interrupt = routes.findIndex((x) => x.includes('interrupt'))
    const message = routes.findIndex((x, i) => i > interrupt && x.includes('/events'))
    expect(raise).toBeGreaterThanOrEqual(0)
    expect(interrupt).toBeGreaterThan(raise)
    expect(message).toBeGreaterThan(interrupt)
    await cron(); await cron()
  })

  it('refusals: an empty text, a person’s day, the platform’s day, three sessions open: nothing sent, nothing reserved', async () => {
    const day = (await su`select to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as d`)[0]!.d as string
    for (const s of await su`select id from studio_sessions where user_id = ${f.user} and ended_at is null`) await su`update studio_sessions set ended_at = now(), end_reason = 'stopped' where id = ${s.id}`
    const n = fake.state.requests.length
    expect(await S.send(f.auth, '   ', deps())).toEqual({ ok: false, why: 'input' })
    await su`insert into studio_spend_people (day, user_id, reserved_micro) values (${day}, ${f.user}, 2900000) on conflict (day, user_id) do update set reserved_micro = studio_spend_people.reserved_micro + 2900000`
    expect(await S.send(f.auth, 'hello', deps())).toEqual({ ok: false, why: 'person_day' })
    await su`update studio_spend_people set reserved_micro = reserved_micro - 2900000 where day = ${day} and user_id = ${f.user}`
    const [d0] = await su`select reserved_micro, measured_micro from studio_spend_days where day = ${day}`
    await su`update studio_spend_days set reserved_micro = reserved_micro + 10000000 where day = ${day}`
    expect(await S.send(f.auth, 'hello', deps())).toEqual({ ok: false, why: 'platform_day' })
    await su`update studio_spend_days set reserved_micro = ${d0!.reserved_micro} where day = ${day}`
    // Three other sessions open on the platform: a new session is refused (an open one would still take a turn).
    const others = await su<{ id: string }[]>`insert into studio_sessions (tenant_id, partner_id, partner_member_id, user_id)
      select ${f.tenant}, ${f.partner}, ${f.member}, gen_random_uuid() from generate_series(1, 3) returning id`
    try { expect(await S.send(f.auth, 'hello', deps())).toEqual({ ok: false, why: 'sessions' }) }
    finally { for (const o of others) await su`update studio_sessions set ended_at = now(), end_reason = 'stopped' where id = ${o.id}` }
    expect(fake.state.requests.length).toBe(n) // nothing reached Anthropic
    expect(await openSession()).toBeUndefined()
    expect(await reserved()).toBe(0)
  })

  it('the margin gone (the largest request reaches the ceiling): the session ends `restart` and a new one starts', async () => {
    expect((await S.send(f.auth, 'hello', deps())).ok).toBe(true)
    await cron()
    const old = (await openSession())!
    await su`update studio_spend_sessions set largest_micro = 500000 where session_id = ${old.id}`
    expect((await S.send(f.auth, 'hello again', deps())).ok).toBe(true)
    expect((await su`select end_reason from studio_sessions where id = ${old.id}`)[0]!.end_reason).toBe('restart')
    expect((await openSession())!.id).not.toBe(old.id)
    await cron(); await cron()
  })

  it('a budget raise that fails fails the turn and ends the session; nothing is left reserved', async () => {
    const s = (await openSession())!
    fake.state.failNext['POST /v1/sessions/sesn_*'] = 1
    expect(await S.send(f.auth, 'hello', deps())).toEqual({ ok: false, why: 'budget' })
    expect((await su`select end_reason from studio_sessions where id = ${s.id}`)[0]!.end_reason).toBe('restart')
    expect((await su`select failed_reason from studio_turns where session_id = ${s.id} order by sent_at desc limit 1`)[0]!.failed_reason).toBe('budget')
    await cron()
    expect(await reserved()).toBe(0)
    expect(await liveKeys()).toBe(0)
  })

  it('Stop during a turn: the turn fails with its measured cost; Stop with nothing open is fine', async () => {
    expect((await S.send(f.auth, 'facts please', deps())).ok).toBe(true)
    const s = (await openSession())!
    expect((await S.stop(f.auth, rt)).ok).toBe(true)
    const [t] = await su`select t.failed_reason, x.settled_at is not null as settled, x.measured_micro from studio_turns t join studio_spend_turns x on x.turn_id = t.id
      where t.session_id = ${s.id} order by t.sent_at desc limit 1`
    expect(t).toMatchObject({ failed_reason: 'runtime', settled: true })
    expect(Number(t!.measured_micro)).toBeGreaterThan(0) // the request that ran is counted
    expect(await S.stop(f.auth, rt)).toEqual({ ok: true })
    await cron()
    expect(await reserved()).toBe(0)
  })

  it('the cron ends an idle session and one whose person is gone', async () => {
    expect((await S.send(f.auth, 'hello', deps())).ok).toBe(true)
    await cron()
    let s = (await openSession())!
    await su`update studio_sessions set last_activity_at = now() - interval '2 hours' where id = ${s.id}`
    await cron()
    expect((await su`select end_reason from studio_sessions where id = ${s.id}`)[0]!.end_reason).toBe('idle')
    expect((await S.send(f.auth, 'facts please', deps())).ok).toBe(true)
    s = (await openSession())!
    await su`update partner_links set removed_at = now() where tenant_id = ${f.tenant}`
    try {
      await cron()
      expect((await su`select end_reason from studio_sessions where id = ${s.id}`)[0]!.end_reason).toBe('actor')
      expect(await su`select 1 from studio_tool_calls where session_id = ${s.id} and executed_at is not null`).toHaveLength(0)
    } finally { await su`update partner_links set removed_at = null where tenant_id = ${f.tenant}` }
    await cron()
    // Ended with no person to vouch for its cost, the turn keeps its whole reserve counted for the day (the cautious
    // side; for the caps the same as measuring it at the reserve).
    expect(await reserved()).toBe(500_000)
  })

  it('Stop pressed during each start step: what the start made is deleted, nothing runs, nothing stays live', async () => {
    for (const step of ['createVault', 'uploadStarter', 'start'] as const) {
      const vaults = fake.state.vaults.size, files = fake.state.files.size, held = await reserved()
      const live = [...fake.state.sessions.values()].filter((x) => !x.archived).length
      const racing = new Proxy(rt, { get(target, k) {
        const fn = (target as unknown as Record<string, unknown>)[k as string]
        if (k !== step || typeof fn !== 'function') return fn
        return async (...a: unknown[]) => { const v = await (fn as (...x: unknown[]) => Promise<unknown>).apply(target, a); await S.stop(f.auth, rt); return v }
      } })
      const r = await S.send(f.auth, 'hello', { ...deps(), runtime: racing as typeof rt })
      expect({ step, r }).toEqual({ step, r: { ok: false, why: 'start' } })
      await cron()
      const stillLive = [...fake.state.sessions.values()].filter((x) => !x.archived).length
      expect({ step, vaults: fake.state.vaults.size, files: fake.state.files.size, live: stillLive, keys: await liveKeys(), reserved: await reserved() })
        .toEqual({ step, vaults, files, live, keys: 0, reserved: held })
    }
  })

  it('Studio unconfigured: the cron still ends open sessions as `switch` and revokes their keys; the rest waits', async () => {
    expect((await S.send(f.auth, 'hello', deps())).ok).toBe(true)
    const s = (await openSession())!
    const before = await reserved()
    // One run ends it (the work list is read before), the next revokes its key.
    await S.runStudioCron(Date.now() + 40_000, rt, f.tenant, false)
    await S.runStudioCron(Date.now() + 40_000, rt, f.tenant, false)
    const [e] = await su`select end_reason, cleaned_at from studio_sessions where id = ${s.id}`
    expect(e).toMatchObject({ end_reason: 'switch', cleaned_at: null })
    expect(await liveKeys()).toBe(0)
    expect(fake.state.vaults.has(s.vault_id)).toBe(true) // Anthropic's side waits for a key
    expect(await reserved()).toBe(before) // an unbound end keeps the turn's reserve counted
    await cron()
    expect(fake.state.vaults.has(s.vault_id)).toBe(false)
    expect((await su`select cleaned_at from studio_sessions where id = ${s.id}`)[0]!.cleaned_at).not.toBeNull()
  })

  it('the cron ends a session at 23 hours and deletes it at Anthropic 30 days after its end', async () => {
    let s = await openSession()
    if (!s) { await S.send(f.auth, 'hello', deps()); await cron(); s = await openSession() }
    await su`update studio_sessions set created_at = now() - interval '24 hours' where id = ${s!.id}`
    await cron(); await cron()
    const [e] = await su`select end_reason, cleaned_at from studio_sessions where id = ${s!.id}`
    expect(e!.end_reason).toBe('age')
    expect(e!.cleaned_at).not.toBeNull()
    await su`update studio_sessions set ended_at = now() - interval '31 days' where id = ${s!.id}`
    await cron()
    expect((await su`select deleted_at from studio_sessions where id = ${s!.id}`)[0]!.deleted_at).not.toBeNull()
    expect(fake.state.sessions.has(s!.runtime_id)).toBe(false)
  })
}, 120_000)
