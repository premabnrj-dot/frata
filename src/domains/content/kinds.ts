import { z } from 'zod'
import { ICON_NAMES } from '../icons/names'
import { SHOP_PATH } from '../themes/sections'
import { MENU_LIMITS, MenusSchema, type MenuItem } from '../themes/site'
import { layerBytes } from '../themes/layer'
import { plainText } from './plain-text'

// =============================================================================
// FILE: src/domains/content/kinds.ts — WHAT A STORE'S CONTENT IS (V1: plan docs/plans/2026-11-15-v1-content.md).
// One `site_content` row per fact: an announcement bar (≤ 3, dated), a menu (main, footer, phone tabs: one row each),
// the Contact line. Two kinds of schema per kind:
//   - SAVE (strict): the one plain-text rule, links only the store's own paths, caps that keep a row under the
//     database's 32 kB check. A person's save passes these.
//   - READ (tolerant): the shape the store renders, as the look read it before the move (a value a person never
//     re-saved is shown as it was). A row that fails reads as no row: never an error page.
// The schedule lives in the row's columns (schedule.ts), never inside a value. Placements join in V2. Pure.
// =============================================================================

export const CONTENT_KINDS = ['announcement', 'menu', 'contact'] as const
export type ContentKind = (typeof CONTENT_KINDS)[number]
export const MENU_KEYS = ['main', 'footer', 'tabs'] as const
export type MenuKey = (typeof MENU_KEYS)[number]
export const CONTACT_KEY = 'contact'
export const KEY_PATTERN = /^[a-z0-9.-]{1,40}$/
/** How many bars a store keeps (live, scheduled or ended, not deleted). */
export const MAX_BARS = 3
/** A row's value in JSON bytes, below the database's 32 kB check with room for jsonb's spacing. */
export const MAX_VALUE_BYTES = 30_000
/** A menu's items at every level together (Zod alone would allow 12 × 12 × 12). */
export const MAX_MENU_ITEMS = 60
export const BAR_SCHEMES = ['paper', 'tint', 'ink'] as const
export const BAR_TEXT_MAX = 120
export const CONTACT_MAX = 160

const shopLink = z.string().regex(SHOP_PATH)

// ── Announcement ────────────────────────────────────────────────────────────────────────────────────────────────
export const BarSave = z.object({ text: plainText(BAR_TEXT_MAX), link: shopLink.nullable(), scheme: z.enum(BAR_SCHEMES) }).strict()
export type BarValue = z.infer<typeof BarSave>
const BarRead = z.object({ text: z.string().trim().min(1).max(BAR_TEXT_MAX), link: shopLink.nullable().catch(null), scheme: z.enum(BAR_SCHEMES).catch('paper') })
export const readBar = (raw: unknown): BarValue | null => { const r = BarRead.safeParse(raw); return r.success ? r.data : null }

// ── Menus ───────────────────────────────────────────────────────────────────────────────────────────────────────
const itemSave: z.ZodType<MenuItem> = z.lazy(() => z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/), label: plainText(MENU_LIMITS.label), link: shopLink,
  icon: z.enum(ICON_NAMES).nullable().default(null), children: z.array(itemSave).max(MENU_LIMITS.items).default([]),
}).strict() as z.ZodType<MenuItem>)
const depthOk = (xs: MenuItem[], d = 1): boolean => xs.every((x) => (x.children.length ? d < MENU_LIMITS.depth && depthOk(x.children, d + 1) : true))
const count = (xs: MenuItem[]): number => xs.reduce((n, x) => n + 1 + count(x.children), 0)
const ids = (xs: MenuItem[]): string[] => xs.flatMap((x) => [x.id, ...ids(x.children)])
const MENU_SAVE: Record<MenuKey, z.ZodType<MenuItem[]>> = {
  main: z.array(itemSave).max(MENU_LIMITS.items).refine((xs) => depthOk(xs), 'At most 3 levels.'),
  footer: z.array(itemSave).max(MENU_LIMITS.items).refine((xs) => xs.every((x) => !x.children.length), 'One level only.'),
  tabs: z.array(itemSave).max(MENU_LIMITS.tabs).refine((xs) => xs.every((x) => !x.children.length && x.icon), 'Each tab needs an icon.'),
}
export const MENU_NAMES: Record<MenuKey, string> = { main: 'Main menu', footer: 'Footer menu', tabs: 'Phone tabs' }

/** A menu as a person saves it, or why it can't be saved (in the brand's words). */
export function menuForSave(key: MenuKey, raw: unknown): { ok: true; value: MenuItem[] } | { ok: false; why: string } {
  if (tooBig(raw)) return { ok: false, why: 'This menu is too long. Remove some links.' }
  const p = MENU_SAVE[key].safeParse(raw)
  if (!p.success) return { ok: false, why: p.error.issues[0]?.message ?? 'Check the menu.' }
  if (count(p.data) > MAX_MENU_ITEMS) return { ok: false, why: `A menu holds up to ${MAX_MENU_ITEMS} links in all.` }
  const all = ids(p.data)
  if (new Set(all).size !== all.length) return { ok: false, why: 'Two links share an id. Reload the page.' }
  if (layerBytes(p.data) > MAX_VALUE_BYTES) return { ok: false, why: 'This menu is too long. Remove some links.' }
  return { ok: true, value: p.data }
}

/** Deeper or bigger than any menu can be, walked with a loop before Zod's recursive parse (no stack overflow). */
function tooBig(raw: unknown): boolean {
  const stack: [unknown, number][] = [[raw, 0]]
  let n = 0
  while (stack.length) {
    const [x, d] = stack.pop()!
    if (++n > 2000 || d > 2 * (MENU_LIMITS.depth + 2)) return true
    if (Array.isArray(x)) { for (const y of x) stack.push([y, d + 1]) }
    else if (x && typeof x === 'object' && Object.hasOwn(x, 'children')) stack.push([(x as { children: unknown }).children, d + 1])
  }
  return false
}

/** A stored menu as the store renders it (the look's tolerant shape), or null (no row: the store's default). */
export function readMenu(key: MenuKey, raw: unknown): MenuItem[] | null {
  if (tooBig(raw)) return null
  const p = MenusSchema.shape[key].safeParse(raw)
  return p.success && p.data ? p.data : null
}

// ── Contact line ────────────────────────────────────────────────────────────────────────────────────────────────
export const ContactSave = z.object({ line: plainText(CONTACT_MAX) }).strict()
export type ContactValue = z.infer<typeof ContactSave>
const ContactRead = z.object({ line: z.string().max(CONTACT_MAX).regex(/^[^<>{}\\\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]*$/) })
export const readContactLine = (raw: unknown): ContactValue | null => { const r = ContactRead.safeParse(raw); return r.success && r.data.line.trim() ? { line: r.data.line } : null }

// ── A store's content, as its pages read it ─────────────────────────────────────────────────────────────────────
/** A row as read (dates may arrive as ISO strings from the data cache). */
type When = Date | string
export type ContentRow = { id: string; kind: string; key: string; value: unknown; startsAt: When | null; endsAt: When | null; stoppedAt: When | null; createdAt: When; updatedAt: When }
const at = (x: When) => new Date(x)
const atOr = (x: When | null) => (x === null ? null : new Date(x))
export type BarEntry = { id: string; startsAt: Date | null; endsAt: Date | null; stoppedAt: Date | null; createdAt: Date; updatedAt: Date } & BarValue
export type StoreContent = { bars: BarEntry[]; menus: Partial<Record<MenuKey, MenuItem[]>>; contact: ContactValue | null }
export const NO_CONTENT: StoreContent = { bars: [], menus: {}, contact: null }

/** Rows → what a page shows, each row through its kind's tolerant reader (a row that fails is left out). */
export function contentOf(rows: readonly ContentRow[]): StoreContent {
  const out: StoreContent = { bars: [], menus: {}, contact: null }
  for (const r of rows) {
    if (r.kind === 'announcement') { const v = readBar(r.value); if (v) out.bars.push({ ...v, id: r.id, startsAt: atOr(r.startsAt), endsAt: atOr(r.endsAt), stoppedAt: atOr(r.stoppedAt), createdAt: at(r.createdAt), updatedAt: at(r.updatedAt) }) }
    else if (r.kind === 'menu' && (MENU_KEYS as readonly string[]).includes(r.key)) { const m = readMenu(r.key as MenuKey, r.value); if (m) out.menus[r.key as MenuKey] = m }
    else if (r.kind === 'contact' && r.key === CONTACT_KEY) out.contact = readContactLine(r.value)
  }
  return out
}
