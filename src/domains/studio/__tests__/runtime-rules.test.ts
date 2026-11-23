import { describe, expect, it } from 'vitest'
import { microUsd, type MicroUsd } from '@/domains/money/usd'
import { DEFAULT_PALETTE } from '@/domains/brand/defaults'
import { emptyRecord } from '@/domains/brand/record'
import { outlineLogo } from '@/domains/brand/outline'
import { STUDIO_MODEL } from '../model'
import { budgetFor, capsFor, ceilingOf, deltaOf, fromCents, mayReserve, studioCaps, toCents } from '../spend'
import { callAccepted, turnOpen, turnState } from '../turn'
import { dueForDelete, endReason, IDLE_END_MS, MAX_AGE_MS } from '../session'
import { isToolName, mayStartSession, parseToolInput, TOOL_NAMES } from '../tools'
import { changesSomething, checkLogo, checkTokens, LOGO_SLOT, PROPOSAL_VALUE_MAX_BYTES } from '../proposals'
import { BrandPatchSchema } from '@/domains/brand/patch'
import { TOOL_ERRORS, TOOL_KIND } from '../tools'

const u = (d: number) => microUsd(d)
const zero = { reserved: 0 as MicroUsd, measured: 0 as MicroUsd }

describe('spend: caps keyed by model', () => {
  it('the studio model has a caps row (check:studio holds this too)', () => {
    expect(studioCaps()).not.toBeNull()
    expect(capsFor(STUDIO_MODEL)!.turnCeiling).toBe(u(0.5))
  })
  it('a model without a row has no caps (every turn refuses)', () => {
    expect(capsFor('claude-opus-5-5')).toBeNull()
  })
  it('cents: rounded down, and back', () => {
    expect(toCents(u(0.129))).toBe(12)
    expect(fromCents('37')).toBe(u(0.37))
    expect(fromCents(null)).toBe(0)
    expect(fromCents('nope')).toBe(0)
  })
  it('a ceiling as asked is clamped to the model maximum; none asked is the default', () => {
    const c = studioCaps()!
    expect(ceilingOf(c)).toBe(u(0.5))
    expect(ceilingOf(c, u(5))).toBe(u(1))
    expect(ceilingOf(c, u(0.3))).toBe(u(0.3))
  })
})

describe('spend: the session budget before a send (spec § 6.7)', () => {
  const c = studioCaps()!
  it('first turn: ceiling minus the floor', () => {
    expect(budgetFor({ spent: u(0), largest: u(0), ceiling: c.turnCeiling, floor: c.floor })).toEqual({ ok: true, cents: 38 })
  })
  it('later turn: spent + ceiling − largest request', () => {
    expect(budgetFor({ spent: u(1.234), largest: u(0.2), ceiling: c.turnCeiling, floor: c.floor })).toEqual({ ok: true, cents: 153 })
  })
  it('a largest request at or above the ceiling restarts the session (F8)', () => {
    expect(budgetFor({ spent: u(1), largest: u(0.5), ceiling: c.turnCeiling, floor: c.floor })).toEqual({ ok: false, why: 'restart' })
  })
  it('a budget is always strictly above what is spent', () => {
    const r = budgetFor({ spent: u(2.999), largest: u(0.49), ceiling: c.turnCeiling, floor: c.floor })
    expect(r).toEqual({ ok: false, why: 'restart' })
  })
})

describe('spend: may a Send reserve', () => {
  const c = studioCaps()!
  it('allows under every cap', () => {
    expect(mayReserve({ caps: c, ceiling: u(0.5), person: zero, platform: zero, openSessions: 0, newSession: true })).toEqual({ ok: true })
  })
  it('counts reserved and measured against the person day', () => {
    expect(mayReserve({ caps: c, ceiling: u(0.5), person: { reserved: u(1), measured: u(1.6) }, platform: zero, openSessions: 0, newSession: false }))
      .toEqual({ ok: false, why: 'person_day' })
  })
  it('the platform day', () => {
    expect(mayReserve({ caps: c, ceiling: u(0.5), person: zero, platform: { reserved: u(0), measured: u(9.6) }, openSessions: 0, newSession: false }))
      .toEqual({ ok: false, why: 'platform_day' })
  })
  it('open sessions count only for a new session', () => {
    expect(mayReserve({ caps: c, ceiling: u(0.5), person: zero, platform: zero, openSessions: 3, newSession: true })).toEqual({ ok: false, why: 'sessions' })
    expect(mayReserve({ caps: c, ceiling: u(0.5), person: zero, platform: zero, openSessions: 3, newSession: false })).toEqual({ ok: true })
  })
  it('the measured delta is never negative and is uncapped', () => {
    expect(deltaOf(u(1), u(0.9))).toBe(0)
    expect(deltaOf(u(1), u(1.8))).toBe(u(0.8))
  })
})

describe('turn state from timestamps', () => {
  const t0 = new Date('2026-11-22T10:00:00Z')
  const base = { sentAt: t0, startedAt: null, endedAt: null, pausedAt: null, failedAt: null }
  it('sending, running, done, paused, failed', () => {
    expect(turnState(base)).toBe('sending')
    expect(turnState({ ...base, startedAt: t0 })).toBe('running')
    expect(turnState({ ...base, startedAt: t0, endedAt: t0 })).toBe('done')
    expect(turnState({ ...base, startedAt: t0, pausedAt: t0 })).toBe('paused')
    expect(turnState({ ...base, startedAt: t0, failedAt: t0, endedAt: t0 })).toBe('failed')
    expect(turnOpen({ ...base, startedAt: t0 })).toBe(true)
  })
  it('a call is accepted only in the open turn, after its message', () => {
    expect(callAccepted({ ...base, startedAt: t0 }, true)).toBe(true)
    expect(callAccepted({ ...base, startedAt: t0 }, false)).toBe(false)
    expect(callAccepted(base, true)).toBe(false)
    expect(callAccepted({ ...base, startedAt: t0, endedAt: t0 }, true)).toBe(false)
  })
})

describe('session end', () => {
  const now = new Date('2026-11-22T12:00:00Z')
  const facts = { now, createdAt: new Date(now.getTime() - 60_000), lastActivityAt: now, turnOpen: false, studioOpen: true, actorLive: true as boolean | null }
  it('stays open by default', () => expect(endReason(facts)).toBeNull())
  it('the switch and a gone person win', () => {
    expect(endReason({ ...facts, studioOpen: false })).toBe('switch')
    expect(endReason({ ...facts, actorLive: false })).toBe('actor')
  })
  it('at 23 hours, before the key ends', () => {
    expect(endReason({ ...facts, createdAt: new Date(now.getTime() - MAX_AGE_MS) })).toBe('age')
  })
  it('after an idle hour, never with a turn open', () => {
    const idle = { ...facts, lastActivityAt: new Date(now.getTime() - IDLE_END_MS) }
    expect(endReason(idle)).toBe('idle')
    expect(endReason({ ...idle, turnOpen: true })).toBeNull()
  })
  it('deleted at Anthropic 30 days after it ends', () => {
    expect(dueForDelete(new Date(now.getTime() - 31 * 86_400_000), now)).toBe(true)
    expect(dueForDelete(new Date(now.getTime() - 29 * 86_400_000), now)).toBe(false)
  })
})

describe('tools', () => {
  it('names and who starts', () => {
    expect(TOOL_NAMES).toEqual(['store_facts', 'tokens_propose', 'logo_propose', 'preview_build'])
    expect(isToolName('content_propose')).toBe(false)
    expect(mayStartSession('partner')).toBe(true)
    expect(mayStartSession('builder')).toBe(false)
    expect(mayStartSession('owner')).toBe(false)
  })
  it('inputs are closed: no store, person or row id slips in', () => {
    expect(parseToolInput('store_facts', {})).toEqual({})
    expect(parseToolInput('store_facts', { tenant_id: 'x' })).toBeNull()
    expect(parseToolInput('tokens_propose', { palette: { accent: '#B5542B' } })).toEqual({ palette: { accent: '#B5542B' } })
    // saveBrand's own shape: a colour that isn't one parses, and the check names it (below).
    expect(parseToolInput('tokens_propose', { palette: { accent: 'red' } })).toEqual({ palette: { accent: 'red' } })
    expect(parseToolInput('tokens_propose', { logos: { main: 'x' } })).toBeNull()
    expect(parseToolInput('tokens_propose', { radius: 5 })).toBeNull()
    expect(parseToolInput('logo_propose', { svg: 'x'.repeat(64 * 1024 + 1) })).toBeNull()
  })
})

describe('proposals', () => {
  const live = emptyRecord(DEFAULT_PALETTE)
  it('an unchanged tokens proposal is refused', () => {
    expect(changesSomething(live, {})).toBe(false)
    expect(checkTokens(live, { radius: live.radius })).toEqual({ ok: false, problems: 'unchanged' })
  })
  it('a colour under contrast is refused before any card draws it', () => {
    const r = checkTokens(live, { palette: { text: live.palette.bg } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.problems).not.toBe('unchanged')
  })
  it('a good change keeps its colours in saved form', () => {
    const r = checkTokens(live, { radius: 16, palette: { accent: '#7a2a1e' } })
    expect(r).toEqual({ ok: true, value: { radius: 16, palette: { accent: '#7A2A1E' } } })
  })
  const shape = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>'
  it('a logo of outlines passes, cleaned', () => {
    expect(checkLogo(shape).ok).toBe(true)
  })
  it('a logo with text, a script or nothing drawn is refused in words', () => {
    const t = checkLogo('<svg xmlns="http://www.w3.org/2000/svg"><text>KESAR</text></svg>')
    expect(t).toMatchObject({ ok: false, reason: 'text' })
    expect(checkLogo('<svg xmlns="http://www.w3.org/2000/svg"><script>x</script><path d="M0 0"/></svg>')).toMatchObject({ ok: false, reason: 'script' })
    expect(outlineLogo('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toEqual({ ok: false, reason: 'empty' })
  })
})

describe('the gaps impact review named', () => {
  const live = emptyRecord(DEFAULT_PALETTE)
  it('every tokens proposal that parses also parses as saveBrand\'s patch (Apply depends on it)', () => {
    const samples = [{}, { radius: 16 }, { palette: { accent: '#7a2a1e', bg: '#FFFFFF' } }, { display: 'inter', body: 'inter', density: 'roomy' }]
    for (const x of samples) {
      const p = parseToolInput('tokens_propose', x)
      expect(p).not.toBeNull()
      expect(BrandPatchSchema.safeParse(p).success).toBe(true)
    }
  })
  it('a colour that is not one, alone, is refused by the check', () => {
    const r = checkTokens(live, { palette: { accent: 'red' } })
    expect(r.ok).toBe(false)
  })
  it('tool kinds and errors cover every tool, in our words', () => {
    expect(Object.keys(TOOL_KIND).sort()).toEqual([...TOOL_NAMES].sort())
    for (const w of Object.values(TOOL_ERRORS)) expect(w.length).toBeLessThan(120)
    expect(LOGO_SLOT).toBe('main')
  })
  it('budget with a spent amount that is not whole cents', () => {
    const c = studioCaps()!
    expect(budgetFor({ spent: u(0.123456), largest: u(0.13), ceiling: c.turnCeiling, floor: c.floor })).toEqual({ ok: true, cents: 49 })
  })
  it('an unchecked actor (null) never ends a session on its own', () => {
    const now = new Date('2026-11-22T12:00:00Z')
    expect(endReason({ now, createdAt: now, lastActivityAt: now, turnOpen: true, studioOpen: true, actorLive: null })).toBeNull()
  })
  it('fromCents refuses junk and negatives', () => {
    expect(fromCents('-5')).toBe(0)
    expect(fromCents('1e3')).toBe(u(10))
    expect(fromCents(Number.NaN)).toBe(0)
  })
  it('outline-only: a tspan, a font-family with no text, and a lone <use> are refused', () => {
    const ns = 'xmlns="http://www.w3.org/2000/svg"'
    expect(outlineLogo(`<svg ${ns}><g><tspan>K</tspan></g><path d="M0 0"/></svg>`)).toMatchObject({ ok: false })
    expect(outlineLogo(`<svg ${ns}><g font-family="Georgia"><path d="M0 0"/></g></svg>`)).toEqual({ ok: false, reason: 'text' })
    expect(outlineLogo(`<svg ${ns}><use href="#a"/></svg>`)).toEqual({ ok: false, reason: 'empty' })
  })
  it('a logo whose stored value would pass the column cap is refused', () => {
    const big = `<svg xmlns="http://www.w3.org/2000/svg">${'<path d="M0 0h1v1z" fill="#000000"/>'.repeat(Math.ceil(PROPOSAL_VALUE_MAX_BYTES / 36))}</svg>`
    expect(checkLogo(big)).toMatchObject({ ok: false, reason: 'too_big' })
  })
})
