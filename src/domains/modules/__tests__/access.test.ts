import { describe, expect, it } from 'vitest'
import { moduleAccess, outboxDecision, type ModuleFacts } from '../access'
import { ADD_ONS, MODULE_KEYS, MODULES, PLAN_GRANTABLE } from '../registry'

const now = new Date('2026-11-07T10:00:00Z')
const day = (n: number) => new Date(now.getTime() + n * 86_400_000)
const none: ModuleFacts = { planFeatures: [], addons: [], switchedOn: [], paused: [] }
/** The registry with chosen modules marked built, so the access rules can be exercised before any module ships. */
const built = (...keys: (keyof typeof MODULES)[]) => { for (const k of keys) (MODULES[k] as { status: string }).status = 'now' }
const unbuilt = (...keys: (keyof typeof MODULES)[]) => { for (const k of keys) (MODULES[k] as { status: string }).status = 'next' }

describe('moduleAccess', () => {
  it('a module not built yet is never usable, whatever the facts', () => {
    unbuilt('communication')
    const a = moduleAccess({ ...none, switchedOn: ['communication'] }, now).communication
    expect(a.usable).toBe(false); expect(a.why).toBe('next'); expect(a.granted).toBe(true)
  })
  it('core: granted to every shop; usable once switched on', () => {
    built('communication')
    expect(moduleAccess(none, now).communication.why).toBe('off')
    const a = moduleAccess({ ...none, switchedOn: ['communication'] }, now).communication
    expect(a).toMatchObject({ usable: true, how: 'core' })
    unbuilt('communication')
  })
  it('an add-on: granted by the plan, a paid add-on, or a live trial; an ended trial or add-on grants nothing', () => {
    built('reviews', 'communication')
    const on = { ...none, switchedOn: ['reviews', 'communication'] as const }
    expect(moduleAccess(on, now).reviews.why).toBe('not_granted')
    expect(moduleAccess({ ...on, planFeatures: ['reviews'] }, now).reviews.how).toBe('plan')
    expect(moduleAccess({ ...on, addons: [{ module: 'reviews', startsAt: day(-1), endsAt: null, trialEndsAt: null }] }, now).reviews.how).toBe('add_on')
    const trial = moduleAccess({ ...on, addons: [{ module: 'reviews', startsAt: day(-1), endsAt: null, trialEndsAt: day(29) }] }, now).reviews
    expect(trial).toMatchObject({ how: 'trial', usable: true }); expect(trial.trialEndsAt).toEqual(day(29))
    expect(moduleAccess({ ...on, addons: [{ module: 'reviews', startsAt: day(-31), endsAt: null, trialEndsAt: day(-1) }] }, now).reviews.why).toBe('not_granted')
    expect(moduleAccess({ ...on, addons: [{ module: 'reviews', startsAt: day(-31), endsAt: day(-1), trialEndsAt: null }] }, now).reviews.why).toBe('not_granted')
    expect(moduleAccess({ ...on, addons: [{ module: 'reviews', startsAt: day(1), endsAt: null, trialEndsAt: null }] }, now).reviews.why).toBe('not_granted') // not started
    unbuilt('reviews', 'communication')
  })
  it('a pause beats the switch; a dependency that is not usable blocks', () => {
    built('reviews', 'communication')
    const f = { ...none, planFeatures: ['reviews'], switchedOn: ['reviews', 'communication'] as const }
    expect(moduleAccess({ ...f, paused: ['reviews'] }, now).reviews.why).toBe('paused')
    const dep = moduleAccess({ ...f, switchedOn: ['reviews'] }, now).reviews
    expect(dep).toMatchObject({ usable: false, why: 'needs', needs: 'communication' })
    unbuilt('reviews', 'communication')
  })
})

describe('outboxDecision', () => {
  it('sends when usable, defers a pause, drops an off switch', () => {
    built('communication')
    const a = moduleAccess({ ...none, switchedOn: ['communication'] }, now)
    expect(outboxDecision(a.communication)).toBe('send')
    expect(outboxDecision(moduleAccess({ ...none, switchedOn: ['communication'], paused: ['communication'] }, now).communication)).toBe('defer')
    expect(outboxDecision(moduleAccess(none, now).communication)).toBe('drop')
    unbuilt('communication')
  })
})

describe('registry', () => {
  it('every dependency is a module; plan-grantable excludes core; add-ons are add_on', () => {
    for (const k of MODULE_KEYS) for (const d of MODULES[k].dependsOn) expect(MODULE_KEYS).toContain(d)
    expect(PLAN_GRANTABLE).not.toContain('communication')
    for (const k of ADD_ONS) expect(MODULES[k].billing).toBe('add_on')
    for (const k of ['rto_shield', 'size_fit', 'cart_flows']) expect(PLAN_GRANTABLE).toContain(k) // existing plan features keep their keys
  })
})
