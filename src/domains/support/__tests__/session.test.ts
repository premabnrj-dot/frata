import { describe, expect, it } from 'vitest'
import { expiresAt, isActive, minutesLeft } from '../session'

const start = new Date('2026-11-06T10:00:00Z')
const s = { expiresAt: expiresAt(start, 60), endedAt: null }

describe('support session', () => {
  it('is active until it expires', () => {
    expect(isActive(s, new Date('2026-11-06T10:59:59Z'))).toBe(true)
    expect(isActive(s, new Date('2026-11-06T11:00:00Z'))).toBe(false)
  })
  it('ends when ended, whatever the clock says', () => {
    expect(isActive({ ...s, endedAt: start }, start)).toBe(false)
  })
  it('counts whole minutes left, never below zero', () => {
    expect(minutesLeft(s, new Date('2026-11-06T10:02:30Z'))).toBe(58)
    expect(minutesLeft(s, new Date('2026-11-06T12:00:00Z'))).toBe(0)
  })
})
