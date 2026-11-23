import { describe, expect, it } from 'vitest'
import { readStoredSignup, STORE_KEY } from '../stored'

const NOW = 1_800_000_000_000
const ok = { name: 'Noor Threads', slug: 'noor-threads', slugEdited: false, arrivedAt: NOW - 5_000 }

describe('readStoredSignup (sessionStorage, O1·9; security review)', () => {
  it('reads back what the page wrote', () => {
    expect(STORE_KEY).toBe('frrata:signup')
    expect(readStoredSignup(JSON.stringify(ok), NOW)).toEqual(ok)
  })
  it('nothing, or not JSON, or not an object, is nothing', () => {
    for (const raw of [null, '', 'not json', '42', '[]', 'null']) expect(readStoredSignup(raw, NOW)).toBeNull()
  })
  it('a name that is not a string, or over 60, is dropped', () => {
    expect(readStoredSignup(JSON.stringify({ ...ok, name: 5 }), NOW)?.name).toBe('')
    expect(readStoredSignup(JSON.stringify({ ...ok, name: 'x'.repeat(61) }), NOW)?.name).toBe('')
  })
  it('a name with markup is kept as plain text, never markup', () => {
    const name = '<img src=x onerror=alert(1)>'
    expect(readStoredSignup(JSON.stringify({ ...ok, name }), NOW)?.name).toBe(name)
  })
  it('a slug that fails slugProblem is dropped (and so is its edited mark)', () => {
    for (const slug of ['ab', '-bad-', 'admin', '<b>', 7]) {
      const r = readStoredSignup(JSON.stringify({ ...ok, slug, slugEdited: true }), NOW)
      expect(r?.slug).toBe(''); expect(r?.slugEdited).toBe(false)
    }
  })
  it('an arrival that is not a finite time, or after now, is dropped', () => {
    for (const arrivedAt of ['1', null, Infinity, NOW + 1]) expect(readStoredSignup(JSON.stringify({ ...ok, arrivedAt }), NOW)?.arrivedAt).toBeNull()
  })
})
