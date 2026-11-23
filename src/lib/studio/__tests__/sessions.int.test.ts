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
