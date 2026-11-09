import { describe, expect, it } from 'vitest'
import { canMakeMain, domainState, type DomainFacts } from '../domain-state'
import { mainAddress } from '../names'

const base: DomainFacts = { provedAt: null, addedAt: null, dnsOkAt: null, certOkAt: null, failingSince: null, mainAt: null, razorpayOkAt: null, contestAt: null, vercelTxt: null, removedAt: null, removedReason: null }
const t = '2026-11-09T10:00:00Z'

describe('domainState (derived from the timestamps, rule 68)', () => {
  it('walks a claim from waiting to main', () => {
    expect(domainState(base)).toBe('waiting')
    expect(domainState({ ...base, contestAt: t })).toBe('held')
    expect(domainState({ ...base, provedAt: t, vercelTxt: 'vc-x' })).toBe('other_account')
    expect(domainState({ ...base, provedAt: t, addedAt: t })).toBe('securing')
    expect(domainState({ ...base, provedAt: t, addedAt: t, certOkAt: t })).toBe('connected')
    expect(domainState({ ...base, provedAt: t, addedAt: t, certOkAt: t, mainAt: t })).toBe('main')
    expect(domainState({ ...base, provedAt: t, addedAt: t, certOkAt: t, mainAt: t, failingSince: t })).toBe('not_working')
  })
  it('says why a row left: another shop or Frrata', () => {
    expect(domainState({ ...base, removedAt: t, removedReason: 'moved' })).toBe('moved')
    expect(domainState({ ...base, removedAt: t, removedReason: 'frrata' })).toBe('disconnected')
  })
  it('Make main: connected, and on live payments only once Razorpay approved it', () => {
    const connected = { ...base, provedAt: t, addedAt: t, certOkAt: t }
    expect(canMakeMain(connected, false)).toBe(true)
    expect(canMakeMain(connected, true)).toBe(false)
    expect(canMakeMain({ ...connected, razorpayOkAt: t }, true)).toBe(true)
    expect(canMakeMain({ ...base, provedAt: t, addedAt: t }, false)).toBe(false)
  })
})

describe('mainAddress (one main address, D2·9)', () => {
  it('is the main domain when there is one, else the frrata name', () => {
    expect(mainAddress('kesar.frrata.shop', 'kesarstudio.in')).toBe('kesarstudio.in')
    expect(mainAddress('kesar.frrata.shop', null)).toBe('kesar.frrata.shop')
  })
})
