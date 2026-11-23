// The tool runner's answers (plan docs/plans/2026-11-22-v3a-runtime.md R5; impact review of R5): an unknown tool or a
// bad input is refused unrun, a failure answers in our words (never the error's), an answer over the stored cap is
// refused, the person gone mid-call stays an `actor` refusal, a logo is cleaned and outline-only before it is proposed,
// tokens the store would refuse are refused, and the preview stand-in answers "not available".
import { describe, expect, it, vi } from 'vitest'
import { emptyRecord } from '@/domains/brand/record'
import { DEFAULT_PALETTE } from '@/domains/brand/defaults'
import { TOOL_ERRORS } from '@/domains/studio/tools'

const reads = { facts: async (): Promise<unknown> => ({ products: { active: 1, first: [] } }) }
vi.mock('@/lib/queries/builder', () => ({
  builderStoreFacts: vi.fn(async () => reads.facts()),
  builderBrand: vi.fn(async () => emptyRecord(DEFAULT_PALETTE)),
}))
vi.mock('@/lib/db/tenant', () => ({ withTenant: vi.fn() }))
vi.mock('@/lib/db/actor', () => ({ builderActor: vi.fn(() => ({ kind: 'builder', role: 'builder' })) }))
const { outcomeOf } = await import('../tools')
const { TurnUnbound } = await import('../as-turn')

const ctx = { turn: { tenantId: 't', sessionId: 's', turnId: 'u' }, reads: { kind: 'builder', role: 'builder' }, write: vi.fn(async (work: (tx: unknown, p: string) => Promise<unknown>) => work({}, 'p')) } as never
const SQUARE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#111"/></svg>'

describe('the tool runner', () => {
  it('refuses an unknown tool and a bad input without running anything', async () => {
    expect(await outcomeOf(ctx, { name: 'orders_read', input: {} })).toEqual({ answer: { error: TOOL_ERRORS.input }, isError: true })
    expect(await outcomeOf(ctx, { name: 'store_facts', input: { tenant_id: 'x' } })).toEqual({ answer: { error: TOOL_ERRORS.input }, isError: true })
    expect(await outcomeOf(ctx, { name: 'logo_propose', input: { svg: 'x'.repeat(70_000) } })).toMatchObject({ isError: true })
  })
  it('answers a failure in our words, and an oversized answer as a failure', async () => {
    reads.facts = async () => { throw new Error('relation "orders" secret=abc') }
    const r = await outcomeOf(ctx, { name: 'store_facts', input: {} })
    expect(r).toEqual({ answer: { error: TOOL_ERRORS.failed }, isError: true })
    reads.facts = async () => ({ blob: 'x'.repeat(20_000) })
    expect(await outcomeOf(ctx, { name: 'store_facts', input: {} })).toEqual({ answer: { error: TOOL_ERRORS.failed }, isError: true })
    reads.facts = async () => { throw new TurnUnbound('gone') }
    await expect(outcomeOf(ctx, { name: 'store_facts', input: {} })).rejects.toBeInstanceOf(TurnUnbound) // asTurn answers `actor`
    reads.facts = async () => ({ products: { active: 1, first: [] } })
  })
  it('Studio\'s database setting broken: the agent is told what to say, and the log names the rule, never the value', async () => {
    const { DbUrlError } = await import('@/lib/db/url')
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    reads.facts = async () => { throw new DbUrlError('[db] DATABASE_URL_BUILDER must log in as frata_builder.<project-ref>, not another role') }
    expect(await outcomeOf(ctx, { name: 'store_facts', input: {} })).toEqual({ answer: { error: TOOL_ERRORS.setup }, isError: true })
    expect(TOOL_ERRORS.setup).toMatch(/word for word\. Studio can’t read your store yet\. Frrata is fixing it\./)
    expect(err).toHaveBeenCalledWith('[studio] tool', 'store_facts', 'DbUrlError', '[db] DATABASE_URL_BUILDER must log in as frata_builder.<project-ref>, not another role')
    reads.facts = async () => { throw new Error('postgresql://frata_builder.ref:secret@host/db') }
    await outcomeOf(ctx, { name: 'store_facts', input: {} })
    expect(err).toHaveBeenLastCalledWith('[studio] tool', 'store_facts', 'Error', '')
    err.mockRestore()
  })
  it('a logo: outlines proposed, text refused in the person’s words', async () => {
    const ok = await outcomeOf(ctx, { name: 'logo_propose', input: { svg: SQUARE } })
    expect(ok).toMatchObject({ isError: false, proposal: { kind: 'logo' } })
    expect(JSON.stringify(ok.proposal?.value)).toContain('<rect')
    const text = await outcomeOf(ctx, { name: 'logo_propose', input: { svg: SQUARE.replace('</svg>', '<text>Kesar</text></svg>') } })
    expect(text).toMatchObject({ isError: true })
    expect(text.proposal).toBeUndefined()
    const script = await outcomeOf(ctx, { name: 'logo_propose', input: { svg: SQUARE.replace('</svg>', '<script>alert(1)</script></svg>') } })
    expect(JSON.stringify(script)).not.toContain('<script')
  })
  it('tokens: unchanged or refused by the store’s own rules is no proposal; a good one is', async () => {
    expect(await outcomeOf(ctx, { name: 'tokens_propose', input: { radius: 8 } })).toMatchObject({ isError: true })
    const bad = await outcomeOf(ctx, { name: 'tokens_propose', input: { palette: { ink: '#FFFFFF', paper: '#FFFFFF' } } })
    expect(bad).toMatchObject({ isError: true })
    expect(bad.proposal).toBeUndefined()
    expect(await outcomeOf(ctx, { name: 'tokens_propose', input: { radius: 12 } })).toMatchObject({ isError: false, proposal: { kind: 'tokens', value: { radius: 12 } } })
  })
  it('the preview stand-in: not available yet', async () => {
    expect(await outcomeOf(ctx, { name: 'preview_build', input: {} })).toEqual({ answer: { error: TOOL_ERRORS.unavailable }, isError: true })
  })
})
