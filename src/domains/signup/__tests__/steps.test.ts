import { describe, expect, it } from 'vitest'
import { ADDRESS_STATES, ADDRESS_WORDS, addressLine, addressUsable, signupMs, signupSteps, stepForRefusal, stepNumber } from '../steps'

describe('signupSteps', () => {
  it('a signed-out person with the WhatsApp code on answers five steps, in order', () => {
    expect(signupSteps({ askEmail: true, codeOn: true })).toEqual(['name', 'email', 'plan', 'phone', 'sells'])
  })
  it('a signed-in person with the code off answers three', () => {
    expect(signupSteps({ askEmail: false, codeOn: false })).toEqual(['name', 'plan', 'sells'])
  })
  it('the email comes right after the name, never later', () => {
    for (const askEmail of [true, false]) for (const codeOn of [true, false]) {
      const s = signupSteps({ askEmail, codeOn })
      expect(s[0]).toBe('name')
      if (askEmail) expect(s.indexOf('email')).toBe(1)
      else expect(s).not.toContain('email')
      expect(s.at(-1)).toBe('sells')
    }
  })
  it('numbers a step from 1; making and done count as the last', () => {
    const s = signupSteps({ askEmail: true, codeOn: false })
    expect(stepNumber(s, 'name')).toBe(1)
    expect(stepNumber(s, 'plan')).toBe(3)
    expect(stepNumber(s, 'making')).toBe(4)
    expect(stepNumber(s, 'done')).toBe(4)
  })
})

describe('signupMs', () => {
  it('is the whole milliseconds between arrival and now, inside a day', () => {
    expect(signupMs(1_000, 42_500)).toBe(41_500)
    expect(signupMs(0, 86_400_000)).toBe(86_400_000)
  })
  it('is null outside 0 to 86,400,000, or without an arrival', () => {
    expect(signupMs(1_000, 999)).toBeNull()
    expect(signupMs(0, 86_400_001)).toBeNull()
    expect(signupMs(null, 5)).toBeNull()
    expect(signupMs(Number.NaN, 5)).toBeNull()
  })
})

describe('address states and words', () => {
  it('every state has words; limited says nothing', () => {
    for (const s of ADDRESS_STATES) expect(typeof ADDRESS_WORDS[s]).toBe('string')
    expect(ADDRESS_WORDS.limited).toBe('')
    expect(ADDRESS_WORDS.ok).toBe('Available')
    expect(ADDRESS_WORDS.reserved).toBe(ADDRESS_WORDS.taken)
  })
  it('the popup line asks for another when taken', () => {
    expect(addressLine('taken')).toBe('Taken. Try another address.')
    expect(addressLine('reserved')).toBe('Taken. Try another address.')
    expect(addressLine('ok')).toBe('Available')
  })
  it('an address can be used when free, or when the check could not say', () => {
    expect(addressUsable('ok')).toBe(true)
    expect(addressUsable('limited')).toBe(true)
    for (const s of ['taken', 'too_short', 'shape', 'reserved'] as const) expect(addressUsable(s)).toBe(false)
  })
})

describe('stepForRefusal', () => {
  it('sends an address or name refusal to the name, a code refusal to the WhatsApp step, others nowhere', () => {
    expect(stepForRefusal('slug_taken')).toBe('name')
    expect(stepForRefusal('bad_slug')).toBe('name')
    expect(stepForRefusal('bad_name')).toBe('name')
    expect(stepForRefusal('bad_code')).toBe('phone')
    expect(stepForRefusal('bad_plan')).toBeNull()
    expect(stepForRefusal(undefined)).toBeNull()
  })
})
