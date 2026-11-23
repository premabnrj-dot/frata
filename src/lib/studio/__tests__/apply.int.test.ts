// Apply and Not this, and the chat the page reads (plan docs/plans/2026-11-22-v3a-runtime.md R7, § The first test steps
// 6–7), on a real Postgres. saveBrand is the console's own writer and reads the signed-in person from the request, so it
// is mocked here (its own tests hold it): what Apply hands it is checked, and what Apply records after. Skipped unless
// INT_DB_HOST is set, as in CI.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { makeStudioStore, type StudioFixture } from './studio-fixture'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'

const save = { calls: [] as unknown[], answer: { ok: true, outcome: 'live', version: 2 } as Record<string, unknown> }
vi.mock('@/lib/content/save', () => ({ saveBrand: vi.fn(async (input: unknown) => { save.calls.push(input); return save.answer }) }))
vi.mock('@/lib/media/brand-files', () => ({ storeSvgLogo: vi.fn(async () => ({ ok: true, url: 'https://blob.example/brand/logo.svg' })) }))

describe.skipIf(!host)('Apply, Not this and the chat', () => {
  let su: import('postgres').Sql, f: StudioFixture, other: StudioFixture
  let A: typeof import('../apply'), Q: typeof import('@/lib/queries/studio')
  const stamp = 'a' + Date.now().toString(36)
  let session = '', turn = '', tokens = '', logo = ''

  /** A session, a turn, two tool calls and their proposals and cards, as the advance writes them. */
  async function chatFor(x: StudioFixture) {
    const [s] = await su<[{ id: string }]>`insert into studio_sessions (tenant_id, partner_id, partner_member_id, user_id, ended_at, end_reason) values (${x.tenant}, ${x.partner}, ${x.member}, ${x.user}, now(), 'stopped') returning id`
    const [t] = await su<[{ id: string }]>`insert into studio_turns (tenant_id, partner_id, session_id, started_at, ended_at) values (${x.tenant}, ${x.partner}, ${s.id}, now(), now()) returning id`
    await su`insert into studio_messages (tenant_id, partner_id, session_id, kind, text) values (${x.tenant}, ${x.partner}, ${s.id}, 'person', 'Make the accent warmer')`
    const out: string[] = []
    for (const [kind, value, n] of [['tokens', { palette: { accent: '#B5542B' } }, 'tokens_propose'], ['logo', { svg: '<svg/>' }, 'logo_propose']] as const) {
      const [c] = await su<[{ id: string }]>`insert into studio_tool_calls (tenant_id, partner_id, session_id, turn_id, tool_use_id, name, input, executed_at, result, is_error, answered_at)
        values (${x.tenant}, ${x.partner}, ${s.id}, ${t.id}, ${'sevt_' + kind + stamp}, ${n}, '{}', now(), '{}', false, now()) returning id`
      const [p] = await su<[{ id: string }]>`insert into studio_proposals (tenant_id, partner_id, session_id, tool_call_id, kind, value) values (${x.tenant}, ${x.partner}, ${s.id}, ${c.id}, ${kind}, ${su.json(value)}) returning id`
      await su`insert into studio_messages (tenant_id, partner_id, session_id, kind, proposal_id) values (${x.tenant}, ${x.partner}, ${s.id}, 'card', ${p.id})`
      out.push(p.id)
    }
    await su`insert into studio_messages (tenant_id, partner_id, session_id, kind, text, event_id) values (${x.tenant}, ${x.partner}, ${s.id}, 'agent', 'I proposed a warmer accent.', ${'sevt_line' + stamp + x.user.slice(0, 4)})`
    return { session: s.id, turn: t.id, tokens: out[0]!, logo: out[1]! }
  }

  beforeAll(async () => {
    Object.assign(process.env, { DATABASE_URL: `postgresql://frata_app:${pass}@${host}/${dbName}` })
    vi.resetModules()
    const { default: postgres } = await import('postgres')
    su = postgres(process.env.ADMIN_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 2, onnotice: () => {} })
    f = await makeStudioStore(su, stamp)
    other = await makeStudioStore(su, stamp + 'b')
    ;({ session, turn, tokens, logo } = await chatFor(f))
    A = await import('../apply')
    Q = await import('@/lib/queries/studio')
  })
  afterAll(async () => { await su?.end() })

  it('the chat: lines in order, the cards with their state, the turn and its work lines; after a seq only what is newer', async () => {
    const c = await Q.studioChat(f.auth, null)
    expect(c.sessionId).toBe(session)
    expect(c.lines.map((l) => l.kind)).toEqual(['person', 'card', 'card', 'agent'])
    expect(c.cards.map((x) => [x.kind, x.state])).toEqual(expect.arrayContaining([['tokens', 'open'], ['logo', 'open']]))
    expect(c.turn).toMatchObject({ id: turn, state: 'done', work: [{ words: 'Checked the colours', done: true }, { words: 'Checked the logo', done: true }] })
    const later = await Q.studioChat(f.auth, c.lines[1]!.seq)
    expect(later.lines.map((l) => l.kind)).toEqual(['card', 'agent'])
    expect(JSON.stringify(c)).not.toMatch(/tool_use|sevt_|"input"|"result"/)
  })

  it('another person, even on another store of theirs, reads none of it and applies none of it', async () => {
    expect((await Q.studioChat(other.auth, null)).sessionId).toBeNull()
    expect(await A.applyProposal(other.auth, tokens, null)).toEqual({ ok: false, error: 'This change is no longer here. Nothing was changed.' })
    expect(save.calls).toHaveLength(0)
  })

  it('Apply: the console’s own save with the version the person holds; then the card reads Applied', async () => {
    expect(await A.applyProposal(f.auth, tokens, 1)).toEqual({ ok: true })
    expect(save.calls.at(-1)).toEqual({ version: 1, patch: { palette: { accent: '#B5542B' } } })
    const [p] = await su`select applied_at is not null as applied, applied_by from studio_proposals where id = ${tokens}`
    expect(p).toEqual({ applied: true, applied_by: f.user })
    expect(await A.applyProposal(f.auth, tokens, 1)).toMatchObject({ ok: false }) // once
  })

  it('a brand changed since: refused in the save’s words, kept on the card, and it may be tried again', async () => {
    save.answer = { ok: false, error: 'The brand changed since you opened it. Reload to see it.' }
    expect(await A.applyProposal(f.auth, logo, 1)).toEqual({ ok: false, error: 'The brand changed since you opened it. Reload to see it.' })
    expect(save.calls.at(-1)).toEqual({ version: 1, patch: { logos: { main: 'https://blob.example/brand/logo.svg' } } })
    const c = await Q.studioChat(f.auth, null)
    expect(c.cards.find((x) => x.id === logo)).toMatchObject({ state: 'refused', reason: 'The brand changed since you opened it. Reload to see it.' })
    save.answer = { ok: true, outcome: 'live', version: 3 }
    expect(await A.applyProposal(f.auth, logo, 2)).toEqual({ ok: true })
    expect((await Q.studioChat(f.auth, null)).cards.find((x) => x.id === logo)).toMatchObject({ state: 'applied', reason: null })
  })

  it('a store with an owner: refused before any save (until V3b)', async () => {
    const x = await chatFor(f)
    const n = save.calls.length
    const [u] = await su<[{ u: string }]>`select gen_random_uuid() as u`
    await su`insert into members (tenant_id, user_id, role) values (${f.tenant}, ${u.u}, 'owner')`
    try {
      expect(await A.applyProposal(f.auth, x.tokens, 1)).toEqual({ ok: false, error: A.OWNER_STORE })
    } finally { await su`delete from members where tenant_id = ${f.tenant} and user_id = ${u.u}` }
    // An open store always has an owner (a partner's store opens only once its owner accepts the handover: a trigger).
    expect(save.calls.length).toBe(n)
    // Not this: set aside, nothing saved.
    expect(await A.dismissProposal(f.auth, x.logo)).toEqual({ ok: true })
    expect((await Q.studioChat(f.auth, null)).cards.find((c) => c.id === x.logo)).toMatchObject({ state: 'dismissed' })
    expect(save.calls.length).toBe(n)
  })
})
