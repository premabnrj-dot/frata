import { afterEach, describe, expect, it } from 'vitest'
import { moduleAccess, type ModuleFacts } from '../access'
import { offerFor, passes } from '../offer'
import { MODULE_KEYS, MODULES } from '../registry'

const now = new Date('2026-11-07T10:00:00Z')
const day = (n: number) => new Date(now.getTime() + n * 86_400_000)
const none: ModuleFacts = { planCode: 'growth', planFeatures: [], addons: [], switchedOn: [], paused: [] }
const shipped = Object.fromEntries(MODULE_KEYS.map((k) => [k, MODULES[k].status]))
afterEach(() => { for (const k of MODULE_KEYS) (MODULES[k] as { status: string }).status = shipped[k]! })
const built = (k: keyof typeof MODULES, s: 'now' | 'next') => { (MODULES[k] as { status: string }).status = s }

describe('offerFor', () => {
  it('a module still coming is "Next": its price shown, the one action is the interest toggle (asked or not)', () => {
    expect(offerFor('reviews', moduleAccess(none, now).reviews, 49900, now)).toMatchObject({ badge: 'Next', price: 'Add-on · ₹499/mo', footer: '₹499/mo', filter: 'next', state: { label: 'Coming next' }, action: { kind: 'interest', asked: false } })
    expect(offerFor('reviews', moduleAccess(none, now).reviews, 49900, now, true, true).action).toEqual({ kind: 'interest', asked: true })
  })
  it('an add-on not bought: the price, and the one action names it', () => {
    built('reviews', 'now')
    const o = offerFor('reviews', moduleAccess(none, now).reviews, 49900, now)
    expect(o).toMatchObject({ badge: 'Add-on · ₹499/mo', price: '₹499/mo + 18% GST', footer: '₹499/mo', filter: 'addon', locked: false, action: { kind: 'ask', label: 'Ask Frrata to add Reviews' } })
    built('reviews', 'next')
  })
  it('an add-on off its plans (Reviews on Launch) offers the plans, not an add', () => {
    built('reviews', 'now')
    const o = offerFor('reviews', moduleAccess({ ...none, planCode: 'launch' }, now).reviews, 49900, now, false)
    expect(o).toMatchObject({ badge: 'In Growth and up', footer: 'On Growth', locked: true, filter: 'plan', action: { kind: 'plans', label: 'See Growth' } })
    built('reviews', 'next')
  })
  it('a trial counts its days down and says the price after', () => {
    built('reviews', 'now')
    const a = moduleAccess({ ...none, addons: [{ module: 'reviews', startsAt: day(-2), endsAt: null, trialEndsAt: day(28) }] }, now).reviews
    expect(offerFor('reviews', a, 49900, now)).toMatchObject({ badge: 'Trial · 28 days left', price: 'Trial · 28 days left, then ₹499/mo', filter: 'addon', state: { label: 'Trial · 28 days left' }, action: { kind: 'switch', on: false } })
    built('reviews', 'next')
  })
  it('a plan module outside the plan points to the plans; in the plan it is a switch', () => {
    built('rto_shield', 'now')
    expect(offerFor('rto_shield', moduleAccess(none, now).rto_shield, null, now).action).toEqual({ kind: 'plans', label: 'See Growth' })
    expect(offerFor('rto_shield', moduleAccess({ ...none, planFeatures: ['rto_shield'], switchedOn: ['rto_shield', 'communication'] }, now).rto_shield, null, now))
      .toMatchObject({ badge: 'In your plan', footer: 'Included', filter: 'included', state: { label: 'On' }, action: { kind: 'switch', on: true } })
    built('rto_shield', 'next')
  })
  it('a paused module says so and keeps its switch', () => {
    built('communication', 'now')
    const o = offerFor('communication', moduleAccess({ ...none, switchedOn: ['communication'], paused: ['communication'] }, now).communication, null, now)
    expect(o).toMatchObject({ badge: 'Paused by Frrata', tone: 'warn', action: { kind: 'switch', on: true } })
    built('communication', 'next')
  })
  it('an app that needs another app turned on first links to it, never a switch that fails', () => {
    built('rto_shield', 'now')
    const a = moduleAccess({ ...none, planFeatures: ['rto_shield'] }, now).rto_shield
    expect(offerFor('rto_shield', a, null, now, true, false, 'communication').action).toEqual({ kind: 'needs', module: 'communication', name: 'Messages' })
    built('rto_shield', 'next')
  })
  it('filters: All passes everything; each filter only its own', () => {
    const o = offerFor('reviews', moduleAccess(none, now).reviews, 49900, now)
    expect(passes(o, 'all')).toBe(true); expect(passes(o, 'next')).toBe(true); expect(passes(o, 'addon')).toBe(false)
  })
})
