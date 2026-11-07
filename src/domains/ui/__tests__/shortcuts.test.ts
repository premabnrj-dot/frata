import { describe, expect, it } from 'vitest'
import { confirmKey, inField, shortcutFor, SHORTCUTS, type KeyInput } from '../shortcuts'

const press = (key: string, o: Partial<KeyInput> = {}): KeyInput => ({
  key, ctrlKey: false, metaKey: false, altKey: false, target: { tag: 'BODY', editable: false }, modalOpen: false, enabled: true, ...o,
})

describe('queue keys', () => {
  it('each key does its one thing', () => {
    expect(shortcutFor(press('j'))).toBe('next')
    expect(shortcutFor(press('k'))).toBe('previous')
    expect(shortcutFor(press('c'))).toBe('confirm')
    expect(shortcutFor(press('z'))).toBe('undo')
    expect(shortcutFor(press('/'))).toBe('search')
    expect(shortcutFor(press('q'))).toBe(null)
    expect(new Set(SHORTCUTS.map((s) => s.key)).size).toBe(SHORTCUTS.length)
  })
  it('never while typing: text fields, textareas, selects, contenteditable', () => {
    expect(shortcutFor(press('c', { target: { tag: 'INPUT', editable: false, type: 'search' } }))).toBe(null)
    expect(shortcutFor(press('c', { target: { tag: 'INPUT', editable: false, type: null } }))).toBe(null)
    expect(shortcutFor(press('c', { target: { tag: 'TEXTAREA', editable: false } }))).toBe(null)
    expect(shortcutFor(press('c', { target: { tag: 'DIV', editable: true } }))).toBe(null)
    // A checkbox is not a text field: x on a row's checkbox still selects.
    expect(inField({ tag: 'INPUT', editable: false, type: 'checkbox' })).toBe(false)
  })
  it('never with a modifier (the browser and screen readers own those), never under a dialog', () => {
    expect(shortcutFor(press('c', { ctrlKey: true }))).toBe(null)
    expect(shortcutFor(press('c', { metaKey: true }))).toBe(null)
    expect(shortcutFor(press('c', { modalOpen: true }))).toBe(null)
    expect(shortcutFor(press('Escape', { modalOpen: true }))).toBe(null)
    expect(shortcutFor(press('Escape'))).toBe('close')
  })
  it('turned off: single keys do nothing, but ? still shows the list (where the switch is)', () => {
    expect(shortcutFor(press('c', { enabled: false }))).toBe(null)
    expect(shortcutFor(press('?', { enabled: false }))).toBe('help')
  })
  it('Enter opens only a focused row, never hijacking a button or link', () => {
    expect(shortcutFor(press('Enter', { target: { tag: 'TR', editable: false } }))).toBe('open')
    expect(shortcutFor(press('Enter', { target: { tag: 'BUTTON', editable: false } }))).toBe(null)
  })
  it('c on a high-risk or unconfirmable order opens it instead', () => {
    expect(confirmKey({ canConfirm: true, risk: 'low' })).toBe('confirm')
    expect(confirmKey({ canConfirm: true, risk: 'medium' })).toBe('confirm')
    expect(confirmKey({ canConfirm: true, risk: 'high' })).toBe('open')
    expect(confirmKey({ canConfirm: false, risk: 'low' })).toBe('open')
  })
})
