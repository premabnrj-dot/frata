// =============================================================================
// FILE: src/domains/studio/layout.ts — THE STUDIO WORKBENCH'S LAYOUT (spec docs/specs/2026-11-22-studio-workbench.md § 1;
// plan docs/plans/2026-11-22-studio-workbench.md WB·1; mockup docs/mockups/2026-11-22-studio-workbench.html screen 1).
//
// Pure: the panels' widths and limits, which are folded, what a key does, and what a phone shows. The React shell
// (src/app/(partner)/partner/fixtures/studio/, test-only until V3b's data lands) feeds it the window's width, the stored layout and a key press, and
// draws the answer. A layout is a convenience kept in the person's browser, never state: a stored layout that does
// not parse is ignored, and the workbench draws its defaults.
// =============================================================================

import { inField, type KeyInput } from '@/domains/ui/shortcuts'
import { clampTo, splitterDrag, splitterKey, type Splitter } from '@/domains/ui/splitter'

export type Side = 'chat' | 'inspector'
export type Region = 'chat' | 'preview' | 'inspector'
export type InspectorTab = 'design' | 'code' | 'checks' | 'versions'
export type PhoneTab = 'chat' | 'website' | 'design'

/** Each side panel: its default width and the range a person may drag it through (spec § 1). */
export const PANELS = {
  chat: { width: 340, min: 280, max: 480 },
  inspector: { width: 320, min: 280, max: 440 },
} as const satisfies Record<Side, { width: number; min: number; max: number }>

/** A folded panel is a 44 px rail. */
export const RAIL = 44
/** Below this the workbench is the phone layout (the console's phone width, design language § UX foundation 10). */
export const PHONE_BELOW = 768
/** Below this a computer starts with the inspector folded (mockup § States: "Narrow computer, under 900 px"). */
export const NARROW_BELOW = 900
export const INSPECTOR_TABS = ['design', 'code', 'checks', 'versions'] as const satisfies readonly InspectorTab[]
export const REGIONS = ['chat', 'preview', 'inspector'] as const satisfies readonly Region[]
/** The phone's bottom bar (spec § 1: one region at a time). */
export const PHONE_TABS = ['chat', 'website', 'design'] as const satisfies readonly PhoneTab[]
/** The preview's widths, as a shopper's phone, a tablet and a computer. */
export const WIDTHS = [390, 768, 1280] as const
export type PreviewWidth = (typeof WIDTHS)[number]

export type Panel = { folded: boolean; width: number }
export type Layout = { chat: Panel; inspector: Panel }

export const clampWidth = (side: Side, px: number): number => clampTo(PANELS[side].min, PANELS[side].max, px, PANELS[side].width)

/** A panel's resize edge as a splitter: the chat is on the left, so → widens it; the inspector on the right, ←. */
export const edgeOf = (side: Side, width: number): Splitter =>
  ({ value: width, min: PANELS[side].min, max: PANELS[side].max, grows: side === 'chat' ? 'ArrowRight' : 'ArrowLeft' })

/** The layout a person sees with nothing stored: both open, except the inspector on a narrow computer. */
export function defaultLayout(viewport: number): Layout {
  return {
    chat: { folded: false, width: PANELS.chat.width },
    inspector: { folded: viewport < NARROW_BELOW, width: PANELS.inspector.width },
  }
}

/** A stored layout, read safely: anything that does not parse gives null, never a throw. */
export function parseLayout(raw: string | null | undefined): Layout | null {
  if (!raw) return null
  let v: unknown
  try { v = JSON.parse(raw) } catch { return null }
  const panel = (side: Side, x: unknown): Panel | null => {
    if (!x || typeof x !== 'object') return null
    const { folded, width } = x as Record<string, unknown>
    if (typeof folded !== 'boolean' || typeof width !== 'number') return null
    return { folded, width: clampWidth(side, width) }
  }
  if (!v || typeof v !== 'object') return null
  const chat = panel('chat', (v as Record<string, unknown>).chat)
  const inspector = panel('inspector', (v as Record<string, unknown>).inspector)
  return chat && inspector ? { chat, inspector } : null
}

export const serializeLayout = (l: Layout): string => JSON.stringify(l)

/** What the workbench draws at this width: the stored layout when there is one, else the defaults. */
export function layoutFor(viewport: number, stored: string | null | undefined): Layout {
  return parseLayout(stored) ?? defaultLayout(viewport)
}

export const isPhone = (viewport: number): boolean => viewport < PHONE_BELOW

export function toggle(l: Layout, side: Side): Layout {
  return { ...l, [side]: { ...l[side], folded: !l[side].folded } }
}

export function open(l: Layout, side: Side): Layout {
  return l[side].folded ? toggle(l, side) : l
}

export const previewOnlyOn = (l: Layout): boolean => l.chat.folded && l.inspector.folded

/** Preview only: folds both side panels, or opens both when both are already folded. */
export function previewOnly(l: Layout): Layout {
  const both = previewOnlyOn(l)
  return { chat: { ...l.chat, folded: !both }, inspector: { ...l.inspector, folded: !both } }
}

export function resize(l: Layout, side: Side, px: number): Layout {
  return { ...l, [side]: { ...l[side], width: clampWidth(side, px) } }
}

/** A key on a panel's edge (← → Home End), or null when it is not an edge key. */
export const edgeKey = (side: Side, width: number, key: string, shift = false): number | null => splitterKey(edgeOf(side, width), key, shift)

/** A drag on a panel's edge: its new width from where the drag started and how far the pointer moved. */
export const dragWidth = (side: Side, startWidth: number, dx: number): number => splitterDrag(edgeOf(side, startWidth), dx)

/** The grid's three columns for a computer: each side its width or the rail. */
export function columns(l: Layout): string {
  const w = (p: Panel) => `${p.folded ? RAIL : p.width}px`
  return `${w(l.chat)} minmax(0,1fr) ${w(l.inspector)}`
}

/** The preview's frame at a shopper's width, scaled down to fit the space it has (never up). */
export function previewScale(available: number, width: PreviewWidth): number {
  if (!(available > 0)) return 1
  return Math.min(1, available / width)
}

/** The inspector's tabs. A phone has no Code tab (spec § 1: Code is a computer screen); before the first build neither
 *  Code nor Checks exists (mockup § States: "No code yet"). */
export function inspectorTabs(phone: boolean, built = true): InspectorTab[] {
  return INSPECTOR_TABS.filter((t) => (built || (t !== 'code' && t !== 'checks')) && !(phone && t === 'code'))
}

/** On a phone, which region the bottom bar's tab shows. */
export const phoneRegion = (tab: PhoneTab): Region => (tab === 'chat' ? 'chat' : tab === 'website' ? 'preview' : 'inspector')

/** F6: the next region (Shift+F6 the one before), folded ones included, since a rail is still a place to land. */
export function nextRegion(from: Region, back = false): Region {
  const at = REGIONS.indexOf(from)
  return REGIONS[(at + (back ? REGIONS.length - 1 : 1)) % REGIONS.length]!
}

export type StudioKey =
  | { do: 'toggle'; side: Side }
  | { do: 'previewOnly' }
  | { do: 'region'; back: boolean }
  | { do: 'tab'; tab: InspectorTab }
  | { do: 'help' }

type KeyRow = { keys: readonly string[]; shows: string; label: string; single: boolean; act: StudioKey }

/**
 * The workbench's keys (spec § 1), one table read by studioKeyFor and by the `?` list, in the list's order. `single`:
 * a single key, so off in a text box, on a phone and when the person turned single keys off. Ctrl/⌘+K (find a page,
 * file or version) is not here: it waits for find (frata-design-language § Neel layout: "Not yet: ⌘K").
 */
export const STUDIO_KEYS = [
  { keys: ['['], shows: '[', label: 'Show or hide the chat', single: true, act: { do: 'toggle', side: 'chat' } },
  { keys: [']'], shows: ']', label: 'Show or hide the inspector', single: true, act: { do: 'toggle', side: 'inspector' } },
  { keys: ['\\'], shows: '\\', label: 'Preview only', single: true, act: { do: 'previewOnly' } },
  { keys: ['F6'], shows: 'F6', label: 'Next panel', single: false, act: { do: 'region', back: false } },
  ...INSPECTOR_TABS.map((tab, i) => ({ keys: [String(i + 1)], shows: '1–4', label: 'Design, Code, Checks or Versions', single: true, act: { do: 'tab', tab } as StudioKey })),
  { keys: ['?'], shows: '?', label: 'Show these keys', single: false, act: { do: 'help' } },
] as const satisfies readonly KeyRow[]

/** The `?` list: one row for each line the table shows (1–4 is one row). */
export const KEY_LIST: readonly { shows: string; label: string }[] = STUDIO_KEYS.filter((k, i, all) => all.findIndex((x) => x.shows === k.shows) === i)
  .map(({ shows, label }) => ({ shows, label }))

/**
 * What a key press means on the workbench, or null to leave it to the browser. Single keys never fire inside a text
 * box, with a modifier, while a dialog is open, on a phone (one region at a time), or when the person turned them off
 * (the orders queue's rule, WCAG 2.1.4). `?` stays on, so the switch can be found, but not in a text box. F6 moves
 * between regions everywhere, a text box included, as a browser's own chrome does; Shift+F6 goes back.
 */
export function studioKeyFor(e: KeyInput & { shiftKey?: boolean; phone?: boolean }): StudioKey | null {
  if (e.modalOpen || e.ctrlKey || e.metaKey || e.altKey) return null
  const row = (STUDIO_KEYS as readonly KeyRow[]).find((k) => k.keys.includes(e.key))
  if (!row) return null
  if (row.act.do === 'region') return { do: 'region', back: !!e.shiftKey }
  if (inField(e.target)) return null
  if (row.single && (!e.enabled || e.phone)) return null
  return row.act
}
