import { describe, expect, it } from 'vitest'
import {
  PANELS, RAIL, columns, defaultLayout, edgeOf, inspectorTabs, layoutFor, open,
  KEY_LIST, STUDIO_KEYS, parseLayout, phoneRegion, previewOnly, previewOnlyOn, previewScale, resize, serializeLayout, studioKeyFor, toggle,
} from '../layout'

const key = (k: string, over: Partial<Parameters<typeof studioKeyFor>[0]> = {}) => studioKeyFor({
  key: k, ctrlKey: false, metaKey: false, altKey: false, target: { tag: 'BODY', editable: false }, modalOpen: false, enabled: true, ...over,
})

describe('the workbench layout (WB·1)', () => {
  it('opens both panels at their drawn widths on a computer, the inspector folded under 900 px', () => {
    expect(defaultLayout(1280)).toEqual({ chat: { folded: false, width: 340 }, inspector: { folded: false, width: 320 } })
    expect(defaultLayout(899).inspector.folded).toBe(true)
    expect(defaultLayout(899).chat.folded).toBe(false)
    expect(defaultLayout(900).inspector.folded).toBe(false)
  })

  it('reads a stored layout safely and clamps its widths', () => {
    const l = { chat: { folded: true, width: 999 }, inspector: { folded: false, width: 10 } }
    expect(parseLayout(JSON.stringify(l))).toEqual({ chat: { folded: true, width: 480 }, inspector: { folded: false, width: 280 } })
    for (const bad of [null, '', '{', 'null', '[]', '{"chat":{}}', '{"chat":{"folded":"yes","width":300},"inspector":{"folded":false,"width":300}}']) {
      expect(parseLayout(bad)).toBeNull()
    }
    expect(layoutFor(1280, 'not json')).toEqual(defaultLayout(1280))
    const round = defaultLayout(1280)
    expect(parseLayout(serializeLayout(round))).toEqual(round)
  })

  it('folds and opens a panel, and Preview only folds both or opens both', () => {
    const l = defaultLayout(1280)
    expect(toggle(l, 'chat').chat.folded).toBe(true)
    expect(toggle(toggle(l, 'chat'), 'chat')).toEqual(l)
    expect(open(toggle(l, 'inspector'), 'inspector').inspector.folded).toBe(false)
    expect(open(l, 'inspector')).toBe(l)
    const only = previewOnly(l)
    expect(previewOnlyOn(only)).toBe(true)
    expect(previewOnly(only)).toEqual(l)
    // One folded: Preview only folds the other.
    expect(previewOnlyOn(previewOnly(toggle(l, 'chat')))).toBe(true)
  })

  it('keeps widths inside their limits, and gives each edge its splitter', () => {
    const l = defaultLayout(1280)
    expect(resize(l, 'chat', 2000).chat.width).toBe(PANELS.chat.max)
    expect(resize(l, 'inspector', 0).inspector.width).toBe(PANELS.inspector.min)
    expect(edgeOf('chat', 340)).toEqual({ value: 340, min: 280, max: 480, grows: 'ArrowRight' })
    expect(edgeOf('inspector', 320)).toEqual({ value: 320, min: 280, max: 440, grows: 'ArrowLeft' })
  })

  it('draws each side as its width or the 44 px rail', () => {
    expect(columns(defaultLayout(1280))).toBe('340px minmax(0,1fr) 320px')
    expect(columns(previewOnly(defaultLayout(1280)))).toBe(`${RAIL}px minmax(0,1fr) ${RAIL}px`)
  })

  it('scales a shopper width down to fit, never up', () => {
    expect(previewScale(580, 1280)).toBeCloseTo(580 / 1280)
    expect(previewScale(580, 390)).toBe(1)
    expect(previewScale(0, 768)).toBe(1)
  })

  it('shows no Code tab on a phone, and neither Code nor Checks before the first build', () => {
    expect(inspectorTabs(false)).toEqual(['design', 'code', 'checks', 'versions'])
    expect(inspectorTabs(true)).toEqual(['design', 'checks', 'versions'])
    expect(inspectorTabs(false, false)).toEqual(['design', 'versions'])
    expect(phoneRegion('website')).toBe('preview')
    expect(phoneRegion('design')).toBe('inspector')
  })

  describe('keys', () => {
    it('maps the drawn keys', () => {
      expect(key('[')).toEqual({ do: 'toggle', side: 'chat' })
      expect(key(']')).toEqual({ do: 'toggle', side: 'inspector' })
      expect(key('\\')).toEqual({ do: 'previewOnly' })
      expect(key('3')).toEqual({ do: 'tab', tab: 'checks' })
      expect(key('?')).toEqual({ do: 'help' })
      expect(key('F6', { shiftKey: true })).toEqual({ do: 'region', back: true })
      expect(key('5')).toBeNull()
      expect(key('a')).toBeNull()
    })

    it('never fires a single key in a text box, with a modifier or under a dialog', () => {
      expect(key('[', { target: { tag: 'INPUT', editable: false, type: 'text' } })).toBeNull()
      expect(key('?', { target: { tag: 'TEXTAREA', editable: false } })).toBeNull()
      expect(key('[', { target: { tag: 'DIV', editable: true } })).toBeNull()
      expect(key('1', { ctrlKey: true })).toBeNull()
      expect(key('[', { metaKey: true })).toBeNull()
      expect(key('[', { modalOpen: true })).toBeNull()
      expect(key('F6', { modalOpen: true })).toBeNull()
    })

    it('F6 works in a text box; the switch turns single keys off but keeps ? and F6', () => {
      expect(key('F6', { target: { tag: 'INPUT', editable: false, type: 'text' } })).toEqual({ do: 'region', back: false })
      expect(key('[', { enabled: false })).toBeNull()
      expect(key('2', { enabled: false })).toBeNull()
      expect(key('?', { enabled: false })).toEqual({ do: 'help' })
      expect(key('F6', { enabled: false })).toEqual({ do: 'region', back: false })
    })

    it('every row of the table acts, and the ? list shows 1–4 once', () => {
      for (const row of STUDIO_KEYS) for (const k of row.keys) expect(key(k), k).toEqual(row.act)
      expect(['1', '2', '3', '4'].map((k) => (key(k) as { tab: string }).tab)).toEqual(['design', 'code', 'checks', 'versions'])
      expect(KEY_LIST.map((k) => k.shows)).toEqual(['[', ']', '\\', 'F6', 'Shift+F6', '1–4', '?'])
    })

    it('holds every modifier off every key, F6 included', () => {
      for (const k of ['[', ']', '\\', '1', 'F6', '?']) for (const m of ['ctrlKey', 'metaKey', 'altKey']) expect(key(k, { [m]: true }), `${m} ${k}`).toBeNull()
      expect(key('F6', { shiftKey: true, target: { tag: 'INPUT', editable: false, type: 'text' } })).toEqual({ do: 'region', back: true })
      expect(key(']', { enabled: false })).toBeNull()
      expect(key('\\', { enabled: false, phone: true })).toBeNull()
      expect(key('?', { enabled: false, phone: true })).toEqual({ do: 'help' })
    })

    it('on a phone only ? and F6 act: one region at a time', () => {
      expect(key('[', { phone: true })).toBeNull()
      expect(key('1', { phone: true })).toBeNull()
      expect(key('?', { phone: true })).toEqual({ do: 'help' })
    })
  })
})
