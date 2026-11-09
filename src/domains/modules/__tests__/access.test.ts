import { afterEach, describe, expect, it } from 'vitest'
import { moduleAccess, outboxDecision, type ModuleFacts } from '../access'
import { ADD_ONS, MODULE_KEYS, MODULES, PLAN_GRANTABLE } from '../registry'

const now = new Date('2026-11-07T10:00:00Z')
const day = (n: number) => new Date(now.getTime() + n * 86_400_000)
const none: ModuleFacts = { planCode: 'growth', planFeatures: [], addons: [], switchedOn: [], paused: [] }
/** The registry with chosen modules marked built, so the access rules can be exercised before any module ships. */
const built = (...keys: (keyof typeof MODULES)[]) => { for (const k of keys) (MODULES[k] as { status: string }).status = 'now' }
const unbuilt = (...keys: (keyof typeof MODULES)[]) => { for (const k of keys) (MODULES[k] as { status: string }).status = 'next' }

// Every test leaves the registry as shipped, even when an assertion fails.
const shipped = Object.fromEntries(MODULE_KEYS.map((k) => [k, MODULES[k].status]))
afterEach(() => { for (const k of MODULE_KEYS) (MODULES[k] as { status: string }).status = shipped[k]! })

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
  it('a dependency paused by Frrata holds the module back too: deferred, never dropped', () => {
    built('communication', 'cart_flows')
    const f = { ...none, planFeatures: ['cart_flows'], switchedOn: ['communication', 'cart_flows'] as const, paused: ['communication'] as const }
    const a = moduleAccess({ ...f, switchedOn: [...f.switchedOn], paused: [...f.paused] }, now).cart_flows
    expect(a.why).toBe('needs'); expect(a.held).toBe(true); expect(outboxDecision(a)).toBe('defer')
    // the dependency merely off is not a pause: dropped
    expect(outboxDecision(moduleAccess({ ...none, planFeatures: ['cart_flows'], switchedOn: ['cart_flows'] }, now).cart_flows)).toBe('drop')
  })
  it('liveAddon: a paid add-on before a trial', () => {
    built('reviews')
    const addons = [
      { id: 't', module: 'reviews' as const, startsAt: day(-2), endsAt: null, trialEndsAt: day(20) },
      { id: 'p', module: 'reviews' as const, startsAt: day(-5), endsAt: null, trialEndsAt: null },
    ]
    expect(moduleAccess({ ...none, addons }, now).reviews.how).toBe('add_on')
  })
})

describe('addOnFor (owner 2026-11-09: Reviews on Growth and Scale only)', () => {
  it('a trial or add-on row grants nothing off those plans; the plan’s own feature always does', async () => {
    const { addOnAllowed } = await import('../access')
    const addons = [{ module: 'reviews' as const, startsAt: day(-2), endsAt: null, trialEndsAt: day(20) }]
    expect(moduleAccess({ ...none, planCode: 'growth', addons }, now).reviews.granted).toBe(true)
    expect(moduleAccess({ ...none, planCode: 'launch', addons }, now).reviews.granted).toBe(false)
    expect(moduleAccess({ ...none, planCode: null, addons }, now).reviews.granted).toBe(false)
    expect(moduleAccess({ ...none, planCode: 'scale', planFeatures: ['reviews'] }, now).reviews.how).toBe('plan')
    expect([addOnAllowed('reviews', 'launch'), addOnAllowed('reviews', 'scale'), addOnAllowed('true_profit', 'launch')]).toEqual([false, true, true])
  })
  it('billed only while the plan sells it and does not include it', async () => {
    const { addOnBillable } = await import('../access')
    expect(addOnBillable('reviews', 'growth', [])).toBe(true)
    expect(addOnBillable('reviews', 'scale', ['reviews'])).toBe(false) // Growth → Scale: it comes with the plan
    expect(addOnBillable('reviews', 'launch', [])).toBe(false) // a downgrade stops the bill
    expect(addOnBillable('nope' as never, 'growth', [])).toBe(false)
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
