'use server'

import { and, eq, isNull, lt, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { Tx } from '@/lib/db'
import { asMember } from '@/lib/auth/as-member'
import { memberAudit } from '@/lib/auth/member-audit'
import { CAN_BUILD, requireMember } from '@/lib/auth/require-member'
import { siteContent } from '@/lib/db/schema-content'
import { shopPages } from '@/lib/db/schema-themes'
import { LIMITS, uncount, withinLimit } from '@/lib/db/rate-limit'
import { BLOB_STORE_ID } from '@/lib/env'
import { errName } from '@/lib/log'
import { hasOwnerIn } from '@/lib/queries/settings'
import { byOf as whoSaved } from '@/lib/queries/content'
import { members } from '@/lib/db/schema'
import { momentIN } from '@/lib/format-date'
import { refreshContent, refreshShop } from '@/lib/storefront/refresh'
import { canon, draftOf, MAX_LIVE_BYTES, targetOf } from '@/lib/themes/pages'
import { contactReadiness, pageReadiness } from '@/lib/themes/page-readiness'
import { contentSaver, SAVER_REFUSAL } from '@/domains/content/who'
import { BarSave, ContactSave, MAX_BARS, MENU_KEYS, menuForSave, type ContentKind } from '@/domains/content/kinds'
import { datesProblem } from '@/domains/content/schedule'
import { refusedChar } from '@/domains/content/plain-text'
import { storeHost } from '@/domains/media/sizes'
import { cleanFill } from '@/domains/themes/clean-images'
import { prunePage } from '@/domains/pages/page'
import { FAQ_ID, FaqItemSchema, MAX_FAQ, PageDraftSchema, type FaqItem, type PageDraft, type PageFill, type PageTemplate } from '@/domains/pages/templates'

// =============================================================================
// Console › Content (V1, plan docs/plans/2026-11-15-v1-content.md; owner-approved mockup 2026-11-15). A save is LIVE.
// Who (src/domains/content/who.ts): owners and Managers; a partner only while the store has no owner (read in the
// save's transaction, failing closed); staff and everyone else read only; a Frrata support
// visit never saves. Every write: the shop's save limit (counted first, given back when refused), the domain's schema,
// the row found under the member's own store with the version the editor holds (a stale save is refused in words with
// who saved last, as a role), `previous` := the entry before, one audit row (field names only, never the words). Undo
// is the saver's own last save, within a minute, checked again like a save. After the commit, the store's cache.
// =============================================================================

export type R<T = object> = ({ ok: true } & T) | { ok: false; error: string; field?: string }
type Auth = Extract<Awaited<ReturnType<typeof requireMember>>, { ok: true }>
type Out<T> = { error: string; field?: string } | ({ done: true } & T)
const UNDO_MS = 60_000
const NOTHING = 'We couldn’t save that. Nothing was changed.'
const FULL = 'Too many saves this minute. Nothing was changed.'
/** Who saved last, as a role (never an email: security review M2), and when. */
const STALE = (by: string | null, when: Date) => { const m = momentIN(when, new Date()); return `${by === 'You' ? 'You' : by === 'Owner' || by === 'Manager' || by === 'Partner' ? `The ${by.toLowerCase()}` : by ?? 'Someone'} changed this ${/^[A-Z][a-z]+day,/.test(m) ? m[0]!.toLowerCase() + m.slice(1) : `on ${m}`}. Reload to see it.` }
const lockStore = (tx: Tx, t: string) => tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`content:${t}`}))`)

/**
 * The one door for every content write: who, the limit, the transaction, the audit row. `scope` says what to purge.
 * `limit`: the save bucket, or Undo's own.
 */
async function write<T extends object>(what: { action: string; scope: 'content' | 'pages'; limit?: 'save' | 'undo' }, work: (tx: Tx, auth: Auth) => Promise<Out<T>>): Promise<R<T>> {
  const who = await requireMember(CAN_BUILD)
  if (!who.ok) return { ok: false, error: who.message }
  const t = who.membership.tenantId
  const bucket = what.limit === 'undo' ? LIMITS.contentUndo : LIMITS.contentSave
  if (!(await withinLimit(bucket, t, new Date(), true))) return { ok: false, error: FULL }
  let r: Awaited<ReturnType<typeof asMember<Out<T>>>>
  try {
    r = await asMember(CAN_BUILD, { action: what.action }, async (tx, auth) => {
      const saver = contentSaver(auth.membership.role, await hasOwnerIn(tx, auth.membership.tenantId), auth.membership.supportSessionId)
      if (saver !== 'yes') return { error: SAVER_REFUSAL[saver] }
      return work(tx, auth)
    })
  } catch (e) {
    console.error(`[content ${what.action}]`, errName(e))
    await uncount(bucket, t)
    return { ok: false, error: NOTHING }
  }
  if (!r.ok) { await uncount(bucket, t); return r }
  if ('error' in r.value) { await uncount(bucket, t); return { ok: false, error: r.value.error, ...(r.value.field ? { field: r.value.field } : {}) } }
  if (what.scope === 'content') await refreshContent(r.tenantId).catch((e: unknown) => console.error('[content purge]', errName(e)))
  else refreshShop(r.tenantId, 'pages')
  revalidatePath('/console/content')
  const { done: _d, ...value } = r.value
  return { ok: true, ...(value as T) }
}

const when = z.iso.datetime({ offset: true }).nullable()
const at = (x: string | null) => (x ? new Date(x) : null)
const entry = (row: typeof siteContent.$inferSelect) => ({ value: row.value, startsAt: row.startsAt?.toISOString() ?? null, endsAt: row.endsAt?.toISOString() ?? null, stoppedAt: row.stoppedAt?.toISOString() ?? null, deletedAt: row.deletedAt?.toISOString() ?? null })
async function rowOf(tx: Tx, t: string, id: string) {
  const [row] = await tx.select().from(siteContent).where(and(eq(siteContent.tenantId, t), eq(siteContent.id, id))).for('update')
  return row ?? null
}
async function byOf(tx: Tx, t: string, userId: string | null, me: string): Promise<string | null> {
  if (!userId) return null
  const rows = await tx.select({ userId: members.userId, role: members.role }).from(members).where(and(eq(members.tenantId, t), eq(members.userId, userId)))
  return whoSaved(userId, me, new Map(rows.map((x) => [x.userId, x.role])))
}
const audit = (tx: Tx, auth: Auth, action: string, id: string, kind: string, key: string, version: number, fields: string[]) =>
  memberAudit(tx, auth, `content.${action}`, id, { kind, key, version, fields })

// ── Bars ────────────────────────────────────────────────────────────────────────────────────────────────────────

const BarInput = z.object({ id: z.uuid().nullable(), version: z.number().int().positive().nullable(), text: z.string().max(400), link: z.string().max(200).nullable(), scheme: z.string().max(10), startsAt: when, endsAt: when })

/** Add a bar, or save one (text, link, colour, dates). */
export async function saveBarAction(input: unknown): Promise<R<{ id: string; version: number }>> {
  const p = BarInput.safeParse(input)
  if (!p.success) return { ok: false, error: NOTHING }
  const v = BarSave.safeParse({ text: p.data.text, link: p.data.link, scheme: p.data.scheme })
  if (!v.success) return { ok: false, error: v.error.issues[0]?.message ?? 'Check the bar.', field: v.error.issues[0]?.path[0] === 'link' ? 'link' : 'text' }
  const startsAt = at(p.data.startsAt), endsAt = at(p.data.endsAt)
  const dates = datesProblem(startsAt, endsAt)
  if (dates) return { ok: false, error: dates, field: 'endsAt' }
  return write({ action: 'bar.save', scope: 'content' }, async (tx, auth): Promise<Out<{ id: string; version: number }>> => {
    const t = auth.membership.tenantId
    await lockStore(tx, t)
    if (!p.data.id) {
      // Deleted bars are kept a while for Undo; an hour on, they go.
      await tx.delete(siteContent).where(and(eq(siteContent.tenantId, t), eq(siteContent.kind, 'announcement'), lt(siteContent.deletedAt, new Date(Date.now() - 3_600_000)))) // clock-ok: server
      const live = await tx.select({ id: siteContent.id }).from(siteContent).where(and(eq(siteContent.tenantId, t), eq(siteContent.kind, 'announcement'), isNull(siteContent.deletedAt)))
      if (live.length >= MAX_BARS) return { error: `${MAX_BARS} of ${MAX_BARS} bars in use. End or delete one first.` }
      const key = `b-${randomBytes(6).toString('hex')}`
      const [row] = await tx.insert(siteContent).values({ tenantId: t, kind: 'announcement', key, value: v.data, startsAt, endsAt, updatedBy: auth.userId }).returning({ id: siteContent.id, version: siteContent.version })
      await audit(tx, auth, 'add', row!.id, 'announcement', key, row!.version, ['text', 'link', 'scheme', 'startsAt', 'endsAt'])
      return { done: true, id: row!.id, version: row!.version }
    }
    const row = await rowOf(tx, t, p.data.id)
    if (!row || row.kind !== 'announcement' || row.deletedAt) return { error: 'This bar is gone. Reload.' }
    if (row.version !== p.data.version) return { error: STALE(await byOf(tx, t, row.updatedBy, auth.userId), row.updatedAt) }
    const version = row.version + 1
    await tx.update(siteContent).set({ value: v.data, startsAt, endsAt, stoppedAt: null, previous: entry(row), version, updatedAt: new Date(), updatedBy: auth.userId })
      .where(and(eq(siteContent.tenantId, t), eq(siteContent.id, row.id), eq(siteContent.version, row.version)))
    await audit(tx, auth, 'save', row.id, 'announcement', row.key, version, ['text', 'link', 'scheme', 'startsAt', 'endsAt'])
    return { done: true, id: row.id, version }
  })
}

const RowInput = z.object({ id: z.uuid(), version: z.number().int().positive() })

/** End a bar now (it stays, marked Ended early), or delete it (kept a while for Undo). */
export async function endBarAction(input: unknown): Promise<R<{ version: number }>> { return barMark(input, 'end') }
export async function deleteBarAction(input: unknown): Promise<R<{ version: number }>> { return barMark(input, 'delete') }
async function barMark(input: unknown, how: 'end' | 'delete'): Promise<R<{ version: number }>> {
  const p = RowInput.safeParse(input)
  if (!p.success) return { ok: false, error: NOTHING }
  return write({ action: `bar.${how}`, scope: 'content' }, async (tx, auth): Promise<Out<{ version: number }>> => {
    const t = auth.membership.tenantId
    const row = await rowOf(tx, t, p.data.id)
    if (!row || row.kind !== 'announcement' || row.deletedAt) return { error: 'This bar is gone. Reload.' }
    if (row.version !== p.data.version) return { error: STALE(await byOf(tx, t, row.updatedBy, auth.userId), row.updatedAt) }
    const version = row.version + 1, now = new Date()
    await tx.update(siteContent).set({ ...(how === 'end' ? { stoppedAt: now } : { deletedAt: now }), previous: entry(row), version, updatedAt: now, updatedBy: auth.userId })
      .where(and(eq(siteContent.tenantId, t), eq(siteContent.id, row.id), eq(siteContent.version, row.version)))
    await audit(tx, auth, how, row.id, 'announcement', row.key, version, [how === 'end' ? 'stoppedAt' : 'deletedAt'])
    return { done: true, version }
  })
}

// ── Menus and the Contact line (one row each, made on the first save) ────────────────────────────────────────────

const OneInput = z.object({ version: z.number().int().positive().nullable() })

/** Save a whole menu (main, footer or phone tabs). */
export async function saveMenuAction(input: unknown): Promise<R<{ id: string; version: number }>> {
  const p = OneInput.extend({ key: z.enum(MENU_KEYS), items: z.unknown() }).safeParse(input)
  if (!p.success) return { ok: false, error: NOTHING }
  const m = menuForSave(p.data.key, p.data.items)
  if (!m.ok) return { ok: false, error: m.why }
  return saveOne('menu', p.data.key, p.data.version, m.value, ['items'])
}

/** Save the Contact line (empty: none). */
export async function saveContactAction(input: unknown): Promise<R<{ id: string; version: number }>> {
  const p = OneInput.extend({ line: z.string().max(400) }).safeParse(input)
  if (!p.success) return { ok: false, error: NOTHING }
  const blank = !p.data.line.trim()
  const v = blank ? { success: true as const, data: { line: '' } } : ContactSave.safeParse({ line: p.data.line })
  if (!v.success) return { ok: false, error: v.error.issues[0]?.message ?? 'Check the line.', field: 'line' }
  return saveOne('contact', 'contact', p.data.version, v.data, ['line'], blank ? undefined : contactReadiness)
}

async function saveOne(kind: ContentKind, key: string, seen: number | null, value: unknown, fields: string[], ready?: (tx: Tx, t: string) => Promise<string | null>): Promise<R<{ id: string; version: number }>> {
  return write({ action: `${kind}.save`, scope: 'content' }, async (tx, auth): Promise<Out<{ id: string; version: number }>> => {
    const t = auth.membership.tenantId
    await lockStore(tx, t)
    if (ready) { const why = await ready(tx, t); if (why) return { error: why } }
    const [row] = await tx.select().from(siteContent).where(and(eq(siteContent.tenantId, t), eq(siteContent.kind, kind), eq(siteContent.key, key))).for('update')
    if (!row) {
      if (seen !== null) return { error: 'This changed since you opened it. Reload to see it.' }
      const [n] = await tx.insert(siteContent).values({ tenantId: t, kind, key, value, updatedBy: auth.userId }).returning({ id: siteContent.id, version: siteContent.version })
      await audit(tx, auth, 'add', n!.id, kind, key, n!.version, fields)
      return { done: true, id: n!.id, version: n!.version }
    }
    if (row.version !== seen) return { error: STALE(await byOf(tx, t, row.updatedBy, auth.userId), row.updatedAt) }
    const version = row.version + 1
    await tx.update(siteContent).set({ value, previous: entry(row), version, updatedAt: new Date(), updatedBy: auth.userId })
      .where(and(eq(siteContent.tenantId, t), eq(siteContent.id, row.id), eq(siteContent.version, row.version)))
    await audit(tx, auth, 'save', row.id, kind, key, version, fields)
    return { done: true, id: row.id, version }
  })
}

/** Undo the caller's own last save of a bar, a menu or the Contact line, within a minute: checked again like a save. */
export async function undoContentAction(input: unknown): Promise<R<{ version: number }>> {
  const p = RowInput.safeParse(input)
  if (!p.success) return { ok: false, error: 'This can’t be undone now.' }
  return write({ action: 'content.undo', scope: 'content', limit: 'undo' }, async (tx, auth): Promise<Out<{ version: number }>> => {
    const t = auth.membership.tenantId
    await lockStore(tx, t)
    const row = await rowOf(tx, t, p.data.id)
    const prev = row?.previous as { value: unknown; startsAt: string | null; endsAt: string | null; stoppedAt: string | null; deletedAt: string | null } | null
    if (!row || !prev || row.version !== p.data.version || row.updatedBy !== auth.userId || Date.now() - row.updatedAt.getTime() > UNDO_MS) return { error: 'This can’t be undone now. Reload to see it.' } // clock-ok: server
    const ok = row.kind === 'announcement' ? BarSave.safeParse(prev.value).success && !datesProblem(at(prev.startsAt), at(prev.endsAt))
      : row.kind === 'menu' ? menuForSave(row.key as (typeof MENU_KEYS)[number], prev.value).ok
      : (prev.value as { line?: string })?.line === '' || ContactSave.safeParse(prev.value).success
    if (!ok) return { error: 'This can’t be undone now. Reload to see it.' }
    if (row.kind === 'announcement' && row.deletedAt && !prev.deletedAt) {
      const live = await tx.select({ id: siteContent.id }).from(siteContent).where(and(eq(siteContent.tenantId, t), eq(siteContent.kind, 'announcement'), isNull(siteContent.deletedAt)))
      if (live.length >= MAX_BARS) return { error: `${MAX_BARS} of ${MAX_BARS} bars in use. End or delete one first.` }
    }
    const version = row.version + 1
    await tx.update(siteContent).set({ value: prev.value, startsAt: at(prev.startsAt), endsAt: at(prev.endsAt), stoppedAt: at(prev.stoppedAt), deletedAt: at(prev.deletedAt), previous: null, version, updatedAt: new Date(), updatedBy: auth.userId })
      .where(and(eq(siteContent.tenantId, t), eq(siteContent.id, row.id), eq(siteContent.version, row.version)))
    await audit(tx, auth, 'undo', row.id, row.kind, row.key, version, ['value'])
    return { done: true, version }
  })
}

// ── Pages and the FAQ (shop_pages: draft = the words, live = what shoppers see, null while hidden) ──────────────────

const MAX_DRAFT_BYTES = 30_000
const pageText = (d: PageDraft): string | null => {
  if (refusedChar(d.title)) return 'Use plain words in the title.'
  for (const f of Object.values(d.fill)) if (f.kind === 'faq') for (const i of f.items) if (refusedChar(i.q) || ('a' in i && refusedChar(i.a, true))) return 'Use plain words in the questions and answers.'
  return null
}
async function pageRow(tx: Tx, t: string, id: string) {
  const [row] = await tx.select().from(shopPages).where(and(eq(shopPages.tenantId, t), eq(shopPages.id, id), isNull(shopPages.removedAt))).for('update')
  return row ?? null
}
/** Writes a page's words; shown unless hidden. `previous` keeps the entry before for Undo. */
async function putPage(tx: Tx, auth: Auth, row: typeof shopPages.$inferSelect, d: PageDraft, action: string): Promise<Out<{ id: string; version: number }>> {
  const t = auth.membership.tenantId
  const fixed = (row.live as { handle?: string } | null)?.handle ?? (row.previous as { live?: { handle?: string } | null } | null)?.live?.handle
  const pruned = prunePage(row.template as PageTemplate, { ...d, handle: fixed ?? d.handle, removed: undefined })
  const fill = cleanFill(pruned.fill, t, storeHost(BLOB_STORE_ID))
  if (!fill) return { error: 'A photo didn’t come from this store. Upload it again.' }
  const draft: PageDraft = { ...pruned, fill }
  const words = pageText(draft)
  if (words) return { error: words }
  if (new TextEncoder().encode(JSON.stringify(draft)).length * 1.1 > MAX_DRAFT_BYTES) return { error: 'This page holds too many words. Shorten some.' }
  if (!draft.hidden) { const why = pageReadiness(row.template as PageTemplate, draft); if (why) return { error: why } }
  const others = await tx.select({ id: shopPages.id, draft: shopPages.draft, live: shopPages.live }).from(shopPages).where(and(eq(shopPages.tenantId, t), isNull(shopPages.removedAt)))
  if (others.some((o) => o.id !== row.id && (o.draft as { handle?: string }).handle === draft.handle)) return { error: 'Another page has that address. Pick another.', field: 'handle' }
  const live = targetOf(draft)
  const bytes = others.reduce((n, o) => n + (o.id === row.id ? 0 : new TextEncoder().encode(canon(o.live)).length), live ? new TextEncoder().encode(canon(live)).length : 0)
  if (bytes > MAX_LIVE_BYTES) return { error: 'Your pages hold too many words together. Shorten one, or hide one.' }
  const version = row.version + 1
  try {
    await tx.update(shopPages).set({ draft, live, previous: { draft: row.draft, live: row.live }, version, updatedAt: new Date(), updatedBy: auth.userId })
      .where(and(eq(shopPages.tenantId, t), eq(shopPages.id, row.id), eq(shopPages.version, row.version)))
  } catch (e) {
    const code = (e as { cause?: { code?: string } }).cause?.code
    if (code === '23505') return { error: 'Another page has that address. Pick another.', field: 'handle' }
    if (code === '22P05') return { error: 'Some of these words can’t be saved. Retype them.' }
    throw e
  }
  await memberAudit(tx, auth, `content.${action}`, row.id, { kind: 'page', key: row.template, version, fields: ['title', 'handle', 'fill', 'hidden'] })
  return { done: true, id: row.id, version }
}

/** Add an About page: hidden until its words are its own. */
export async function addPageAction(input: unknown): Promise<R<{ id: string; version: number }>> {
  const p = z.object({ title: z.string().max(200), handle: z.string().max(200) }).safeParse(input)
  if (!p.success) return { ok: false, error: NOTHING }
  const d = PageDraftSchema.safeParse({ title: p.data.title, handle: p.data.handle, fill: {}, hidden: true })
  if (!d.success) return { ok: false, error: d.error.issues[0]?.path[0] === 'handle' ? 'An address is a-z, 0-9 and dashes.' : 'A title is plain words, up to 60 characters.', field: String(d.error.issues[0]?.path[0] ?? 'title') }
  if (refusedChar(d.data.title)) return { ok: false, error: 'Use plain words in the title.', field: 'title' }
  return write({ action: 'page.add', scope: 'pages' }, async (tx, auth): Promise<Out<{ id: string; version: number }>> => {
    const t = auth.membership.tenantId
    await lockStore(tx, t)
    const rows = await tx.select({ draft: shopPages.draft }).from(shopPages).where(and(eq(shopPages.tenantId, t), isNull(shopPages.removedAt)))
    if (rows.length >= 20) return { error: 'A store has at most 20 pages. Hide one, or ask Frrata to remove one.' }
    if (rows.some((x) => (x.draft as { handle?: string }).handle === d.data.handle)) return { error: 'Another page has that address. Pick another.', field: 'handle' }
    const [row] = await tx.insert(shopPages).values({ tenantId: t, template: 'about', draft: d.data, updatedBy: auth.userId }).returning({ id: shopPages.id, version: shopPages.version })
    await memberAudit(tx, auth, 'content.page.add', row!.id, { kind: 'page', key: 'about', version: row!.version, fields: ['title', 'handle'] })
    return { done: true, id: row!.id, version: row!.version }
  })
}

/** Save a page's title, address (until it has been shown), words and photos, and whether it shows. */
export async function savePageAction(input: unknown): Promise<R<{ id: string; version: number }>> {
  const p = z.object({ id: z.uuid(), version: z.number().int().positive(), draft: PageDraftSchema }).safeParse(input)
  if (!p.success) return { ok: false, error: p.error.issues[0]?.path.includes('handle') ? 'An address is a-z, 0-9 and dashes.' : p.error.issues[0]?.path.includes('title') ? 'A title is plain words, up to 60 characters.' : 'Check the page.' }
  return write({ action: 'page.save', scope: 'pages' }, async (tx, auth): Promise<Out<{ id: string; version: number }>> => {
    const t = auth.membership.tenantId
    await lockStore(tx, t)
    const row = await pageRow(tx, t, p.data.id)
    if (!row || row.template === 'faq') return { error: 'This page is gone. Reload.' }
    if (row.version !== p.data.version) return { error: STALE(await byOf(tx, t, row.updatedBy, auth.userId), row.updatedAt) }
    return putPage(tx, auth, row, p.data.draft, 'page.save')
  })
}

/** Save the FAQ's questions (in order) and the line above them; the FAQ page is made on its first question. */
export async function saveFaqAction(input: unknown): Promise<R<{ id: string; version: number }>> {
  const p = z.object({ id: z.uuid().nullable(), version: z.number().int().positive().nullable(), items: z.array(FaqItemSchema).max(MAX_FAQ) }).safeParse(input)
  if (!p.success) return { ok: false, error: 'Questions take up to 80 characters of plain words. Answers take up to 600.' }
  return write({ action: 'faq.save', scope: 'pages' }, async (tx, auth): Promise<Out<{ id: string; version: number }>> => {
    const t = auth.membership.tenantId
    await lockStore(tx, t)
    let row = p.data.id ? await pageRow(tx, t, p.data.id) : null
    if (p.data.id && !row) return { error: 'The FAQ is gone. Reload.' }
    if (!row) {
      const [faq] = await tx.select().from(shopPages).where(and(eq(shopPages.tenantId, t), eq(shopPages.template, 'faq'), isNull(shopPages.removedAt))).for('update')
      if (faq) return { error: 'Your FAQ changed since you opened it. Reload to see it.' }
      const handles = (await tx.select({ draft: shopPages.draft }).from(shopPages).where(eq(shopPages.tenantId, t))).map((x) => (x.draft as { handle?: string }).handle)
      let handle = 'faq'
      for (let i = 2; handles.includes(handle); i++) handle = `faq-${i}`
      const [n] = await tx.insert(shopPages).values({ tenantId: t, template: 'faq', draft: { title: 'Questions, answered', handle, fill: {}, hidden: false }, updatedBy: auth.userId }).returning()
      row = n!
    } else if (row.version !== p.data.version) return { error: STALE(await byOf(tx, t, row.updatedBy, auth.userId), row.updatedAt) }
    const d = draftOf(row) ?? { title: 'Questions, answered', handle: 'faq', fill: {}, hidden: false }
    const items: FaqItem[] = p.data.items
    const fill: Record<string, PageFill> = { ...d.fill, [FAQ_ID]: { kind: 'faq', items } }
    return putPage(tx, auth, row, { ...d, fill, hidden: items.length === 0 }, 'faq.save')
  })
}

/** Undo the caller's own last page or FAQ save, within a minute. */
export async function undoPageAction(input: unknown): Promise<R<{ id: string; version: number }>> {
  const p = RowInput.safeParse(input)
  if (!p.success) return { ok: false, error: 'This can’t be undone now.' }
  return write({ action: 'page.undo', scope: 'pages', limit: 'undo' }, async (tx, auth): Promise<Out<{ id: string; version: number }>> => {
    const t = auth.membership.tenantId
    await lockStore(tx, t)
    const row = await pageRow(tx, t, p.data.id)
    const prev = row?.previous as { draft: unknown; live: unknown } | null
    if (!row || !prev || row.version !== p.data.version || row.updatedBy !== auth.userId || Date.now() - row.updatedAt.getTime() > UNDO_MS) return { error: 'This can’t be undone now. Reload to see it.' } // clock-ok: server
    const d = PageDraftSchema.safeParse(prev.draft)
    if (!d.success) return { error: 'This can’t be undone now. Reload to see it.' }
    const out = await putPage(tx, auth, row, { ...d.data, hidden: prev.live === null }, 'page.undo')
    if ('error' in out) return out
    await tx.update(shopPages).set({ previous: null }).where(and(eq(shopPages.tenantId, t), eq(shopPages.id, row.id)))
    return out
  })
}
