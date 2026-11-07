import { afterEach, describe, expect, it } from 'vitest'
import { moduleAccess, type ModuleFacts } from '../access'
import { offerFor } from '../offer'
import { MODULE_KEYS, MODULES } from '../registry'

const now = new Date('2026-11-07T10:00:00Z')
const day = (n: number) => new Date(now.getTime() + n * 86_400_000)
const none: ModuleFacts = { planFeatures: [], addons: [], switchedOn: [], paused: [] }
const shipped = Object.fromEntries(MODULE_KEYS.map((k) => [k, MODULES[k].status]))
afterEach(() => { for (const k of MODULE_KEYS) (MODULES[k] as { status: string }).status = shipped[k]! })
const built = (k: keyof typeof MODULES, s: 'now' | 'next') => { (MODULES[k] as { status: string }).status = s }

describe('offerFor', () => {
  it('a module still coming is "Next" with no action, its price shown', () => {
    expect(offerFor('reviews', moduleAccess(none, now).reviews, 49900, now)).toMatchObject({ badge: 'Next', price: 'Add-on · ₹499/mo', action: { kind: 'none' } })
  })
  it('an add-on not bought: the price, and the one action names it', () => {
    built('reviews', 'now')
    const o = offerFor('reviews', moduleAccess(none, now).reviews, 49900, now)
    expect(o).toMatchObject({ badge: 'Add-on · ₹499/mo', price: '₹499/mo + 18% GST', action: { kind: 'ask', label: 'Add Reviews · ₹499/mo' } })
    built('reviews', 'next')
  })
  it('a trial counts its days down and says the price after', () => {
    built('reviews', 'now')
    const a = moduleAccess({ ...none, addons: [{ module: 'reviews', startsAt: day(-2), endsAt: null, trialEndsAt: day(28) }] }, now).reviews
    expect(offerFor('reviews', a, 49900, now)).toMatchObject({ badge: 'Trial · 28 days left', price: 'Trial · 28 days left, then ₹499/mo', action: { kind: 'switch', on: false } })
    built('reviews', 'next')
  })
  it('a plan module outside the plan points to the plans; in the plan it is a switch', () => {
    built('rto_shield', 'now')
    expect(offerFor('rto_shield', moduleAccess(none, now).rto_shield, null, now).action).toEqual({ kind: 'plans', label: 'See plans' })
    expect(offerFor('rto_shield', moduleAccess({ ...none, planFeatures: ['rto_shield'], switchedOn: ['rto_shield'] }, now).rto_shield, null, now))
      .toMatchObject({ badge: 'In your plan', action: { kind: 'switch', on: true } })
    built('rto_shield', 'next')
  })
  it('a paused module says so and keeps its switch', () => {
    built('communication', 'now')
    const o = offerFor('communication', moduleAccess({ ...none, switchedOn: ['communication'], paused: ['communication'] }, now).communication, null, now)
    expect(o).toMatchObject({ badge: 'Paused by Frrata', tone: 'warn', action: { kind: 'switch', on: true } })
    built('communication', 'next')
  })
})
