import { describe, expect, it } from 'vitest'
import { CLOCK_LEEWAY_MS, cursorAfter, opensTurn } from '../events'

// Where the next read starts and which message is a turn's (security review of R5, MED-2).
const e = (at: string, processed = true) => ({ at, processed })
describe('the event cursor', () => {
  it('moves to the latest time, never back, never to empty', () => {
    expect(cursorAfter([e('2026-11-23T00:00:01Z'), e('2026-11-23T00:00:03Z'), e('2026-11-23T00:00:02Z')], null)).toBe('2026-11-23T00:00:03Z')
    expect(cursorAfter([e('2026-11-23T00:00:01Z')], '2026-11-23T00:00:05Z')).toBe('2026-11-23T00:00:05Z')
    expect(cursorAfter([e('')], null)).toBeNull()
    expect(cursorAfter([], '2026-11-23T00:00:05Z')).toBe('2026-11-23T00:00:05Z')
  })
  it('never passes a queued (unprocessed) event', () => {
    expect(cursorAfter([e('2026-11-23T00:00:02Z', false), e('2026-11-23T00:00:04Z')], null)).toBe('2026-11-23T00:00:02Z')
  })
})
describe('a turn’s message', () => {
  const sentAt = new Date('2026-11-23T00:01:00Z')
  const m = (at: string, processed = true) => ({ id: 'sevt_1', at, processed })
  it('is processed, after the turn was sent (a minute’s leeway), held by no earlier turn', () => {
    expect(opensTurn(m('2026-11-23T00:01:02Z'), { sentAt, heldByAnotherTurn: false })).toBe(true)
    expect(opensTurn(m(new Date(sentAt.getTime() - CLOCK_LEEWAY_MS + 1000).toISOString()), { sentAt, heldByAnotherTurn: false })).toBe(true)
    expect(opensTurn(m('2026-11-22T23:59:59Z'), { sentAt, heldByAnotherTurn: false })).toBe(false)
    expect(opensTurn(m('2026-11-23T00:01:02Z', false), { sentAt, heldByAnotherTurn: false })).toBe(false)
    expect(opensTurn(m('2026-11-23T00:01:02Z'), { sentAt, heldByAnotherTurn: true })).toBe(false)
    expect(opensTurn(m(''), { sentAt, heldByAnotherTurn: false })).toBe(false)
  })
})
