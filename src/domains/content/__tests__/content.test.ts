import { describe, expect, it } from 'vitest'
import { plainText, refusedChar } from '../plain-text'
import { entryState, datesProblem } from '../schedule'
import { barFor, barChip, type WrittenBar } from '../bar'
import { contentSaver } from '../who'
import { BarSave, contentOf, menuForSave, readBar, readContactLine, readMenu, MAX_MENU_ITEMS } from '../kinds'

const now = new Date('2026-11-20T10:00:00Z')
const h = (n: number) => new Date(now.getTime() + n * 3_600_000)

describe('plainText', () => {
  const t = plainText(40)
  it('keeps Hindi and Tamil, with ZWNJ and ZWJ', () => {
    expect(t.parse('शादी का संग्रह')).toBe('शादी का संग्रह')
    expect(t.parse('க்‌ஷ')).toBe('க்‌ஷ')
    expect(t.parse('क्‍ष')).toBe('क्‍ष')
  })
  it('normalises to NFC and trims', () => { expect(t.parse('  é ')).toBe('é') })
  it.each([['​'], ['⁠'], ['﻿'], ['؜'], [' '], [' '], ['­'], ['‮'], ['\u{E0041}'], [''], ['\u0007'], ['<'], ['>'], ['{'], ['}'], ['\\']])('refuses %j', (c) => {
    expect(t.safeParse(`a${c}b`).success).toBe(false)
  })
  it('a line break only where lines are allowed', () => {
    expect(refusedChar('a\nb')).toBe('\n')
    expect(plainText(40, { lines: true }).parse('a\r\nb')).toBe('a\nb')
  })
  it('caps the length and refuses blank', () => {
    expect(t.safeParse('x'.repeat(41)).success).toBe(false)
    expect(t.safeParse('   ').success).toBe(false)
  })
})

describe('schedule', () => {
  it('derives the state from the columns', () => {
    expect(entryState({ startsAt: null, endsAt: null, stoppedAt: null }, now)).toBe('live')
    expect(entryState({ startsAt: h(1), endsAt: null, stoppedAt: null }, now)).toBe('scheduled')
    expect(entryState({ startsAt: h(-2), endsAt: h(-1), stoppedAt: null }, now)).toBe('ended')
    expect(entryState({ startsAt: null, endsAt: h(5), stoppedAt: h(-1) }, now)).toBe('stopped')
    expect(entryState({ startsAt: null, endsAt: now, stoppedAt: null }, now)).toBe('ended')
  })
  it('refuses an end before the start', () => {
    expect(datesProblem(h(2), h(1))).toMatch(/End is before the start/)
    expect(datesProblem(h(1), h(2))).toBeNull()
    expect(datesProblem(null, h(2))).toBeNull()
  })
})

describe('the bar', () => {
  const bar = (id: string, o: Partial<WrittenBar> = {}): WrittenBar => ({ id, startsAt: null, endsAt: null, stoppedAt: null, createdAt: h(-48), updatedAt: h(-48), ...o })
  const standing = bar('a'), sale = bar('b', { startsAt: h(-1), endsAt: h(24) }), later = bar('c', { startsAt: h(2) })
  it('a live offer shows first', () => { expect(barFor(true, [standing, sale], now)).toEqual({ kind: 'offer' }) })
  it('else the live bar that started last', () => {
    expect(barFor(false, [standing, sale, later], now)).toEqual({ kind: 'written', entry: sale })
    expect(barFor(false, [standing], now)).toEqual({ kind: 'written', entry: standing })
    expect(barFor(false, [later], now)).toBeNull()
  })
  it('ties go to the last saved', () => {
    const x = bar('x', { updatedAt: h(-2) }), y = bar('y', { updatedAt: h(-1) })
    expect(barFor(false, [x, y], now)).toEqual({ kind: 'written', entry: y })
  })
  it('chips agree with the rule', () => {
    expect(barChip(sale, true, [standing, sale], now)).toBe('after_offer')
    expect(barChip(sale, false, [standing, sale], now)).toBe('live')
    expect(barChip(standing, false, [standing, sale], now)).toBe('behind')
    expect(barChip(later, false, [later], now)).toBe('scheduled')
  })
})

describe('who saves', () => {
  it('is an allow-list', () => {
    expect(contentSaver('owner', null)).toBe('yes')
    expect(contentSaver('admin', null)).toBe('yes')
    expect(contentSaver('partner', null)).toBe('yes') // before and after handover (owner, 2026-11-15)
    expect(contentSaver('staff', null)).toBe('read_only')
    expect(contentSaver('accountant', null)).toBe('read_only')
    expect(contentSaver('builder', null)).toBe('read_only')
    expect(contentSaver('owner', 'sess')).toBe('support')
    expect(contentSaver('partner', 'sess')).toBe('support')
  })
})

describe('kinds', () => {
  it('a bar saves plain words and a store link only', () => {
    expect(BarSave.safeParse({ text: 'Sale', link: '/products', scheme: 'ink' }).success).toBe(true)
    expect(BarSave.safeParse({ text: 'Sale', link: 'https://evil.example', scheme: 'ink' }).success).toBe(false)
    expect(BarSave.safeParse({ text: 'Sale‮', link: null, scheme: 'ink' }).success).toBe(false)
  })
  it('reads a moved bar as the look showed it, and drops a bad link', () => {
    expect(readBar({ text: 'Sale​', link: '//evil', scheme: 'odd' })).toEqual({ text: 'Sale​', link: null, scheme: 'paper' })
    expect(readBar({ text: '' })).toBeNull()
  })
  const item = (id: string, children: unknown[] = []) => ({ id, label: id, link: '/products', icon: null, children })
  it('a menu save keeps the limits', () => {
    expect(menuForSave('main', [item('a', [item('b', [item('c')])])]).ok).toBe(true)
    expect(menuForSave('main', [item('a', [item('b', [item('c', [item('d')])])])]).ok).toBe(false)
    expect(menuForSave('footer', [item('a', [item('b')])]).ok).toBe(false)
    expect(menuForSave('tabs', [item('a')]).ok).toBe(false)
    expect(menuForSave('main', [item('a'), item('a')]).ok).toBe(false)
    const wide = Array.from({ length: 12 }, (_, i) => item(`p${i}`, Array.from({ length: 6 }, (_, j) => item(`p${i}-${j}`))))
    const r = menuForSave('main', wide)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.why).toContain(String(MAX_MENU_ITEMS))
    expect(menuForSave('main', [{ ...item('a'), label: 'x<y' }]).ok).toBe(false)
  })
  it('reads a stored menu, an empty one stays empty', () => {
    expect(readMenu('main', [])).toEqual([])
    expect(readMenu('main', 'nope')).toBeNull()
  })
  it('reads the contact line only when it has words', () => {
    expect(readContactLine({ line: '  ' })).toBeNull()
    expect(readContactLine({ line: 'We reply within the day.' })).toEqual({ line: 'We reply within the day.' })
  })
  it('turns rows into a page’s content, cached dates included', () => {
    const c = contentOf([
      { id: '1', kind: 'announcement', key: 'a1', value: { text: 'Sale', link: null, scheme: 'ink' }, startsAt: h(-1).toISOString(), endsAt: null, stoppedAt: null, createdAt: h(-2).toISOString(), updatedAt: h(-2).toISOString() },
      { id: '2', kind: 'menu', key: 'footer', value: [item('a')], startsAt: null, endsAt: null, stoppedAt: null, createdAt: now, updatedAt: now },
      { id: '3', kind: 'menu', key: 'odd', value: [], startsAt: null, endsAt: null, stoppedAt: null, createdAt: now, updatedAt: now },
      { id: '4', kind: 'contact', key: 'contact', value: { line: 'Hi' }, startsAt: null, endsAt: null, stoppedAt: null, createdAt: now, updatedAt: now },
    ])
    expect(c.bars[0]!.startsAt).toEqual(h(-1))
    expect(Object.keys(c.menus)).toEqual(['footer'])
    expect(c.contact).toEqual({ line: 'Hi' })
  })
})
