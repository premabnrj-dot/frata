import 'server-only'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Tx } from '@/lib/db'
import { asMember } from '@/lib/auth/as-member'
import { memberAudit } from '@/lib/auth/member-audit'
import { CAN_BUILD, CAN_MANAGE, requireMember } from '@/lib/auth/require-member'
import { shopSettings } from '@/lib/db/schema'
import { brandProposals, brandTokens } from '@/lib/db/schema-brand'
import { LIMITS, uncount, withinLimit, type Limit } from '@/lib/db/rate-limit'
import { BLOB_STORE_ID } from '@/lib/env'
import { errName } from '@/lib/log'
import { photosAreMade } from '@/lib/media/uploaded'
import { svgIsStored, afterMainLogo } from '@/lib/media/brand-files'
import { shopBrand, shopBrandWith } from '@/lib/queries/brand'
import { refreshShop } from '@/lib/storefront/refresh'
import { storeHost } from '@/domains/media/sizes'
import { brandProblems, type BrandField } from '@/domains/brand/check'
import { changesOf, changeSummary } from '@/domains/brand/diff'
import { acceptedBrandFile, rasterBase } from '@/domains/brand/files'
import { COLOUR_ROLES, DENSITIES, FONTS, LOGO_SLOTS, normalHex, RADII, type BrandRecord, type LogoSlot } from '@/domains/brand/record'
import { readRecord } from '@/domains/brand/schema'
import { BRAND_REFUSAL, brandSaver, decidesBrand } from '@/domains/brand/who'

// =============================================================================
// FILE: src/lib/content/save.ts — THE ONE WRITER OF A STORE'S BRAND RECORD (one-address plan P1·3; spec § 5: "saveBrand
// is the only writer of the record and of logo_url"). Console › Brand, Settings › Store details' logo and, later,
// Studio's Apply all call it. Who (src/domains/brand/who.ts): the owner and Managers save live; the store's partner saves
// live until the store opens, then its save waits for the owner (O17: one Notices line, Approve or Decline); a Builder,
// staff and a support visit never save. Every write: the store's save limit (counted first, given back when refused),
// Zod with caps, each logo file in the store's own folder and really there, brandProblems (contrast, fonts, steps), the
// record's version (a stale save is refused), `previous` := the live record (Undo), one audit row with field names only
// (Activity), and after the commit `shop:<t>:settings` only. A theme shop has no record (O19): its logo alone is saved,
// live, as before.
// =============================================================================

export type BrandResult =
  | { ok: true; outcome: 'live' | 'waits' | 'unchanged'; version: number | null }
  | { ok: false; error: string; fields?: Partial<Record<BrandField | LogoSlot, string>> }
type Auth = Extract<Awaited<ReturnType<typeof requireMember>>, { ok: true }>
type Out = { error: string; fields?: Partial<Record<BrandField | LogoSlot, string>> } | { outcome: 'live' | 'waits' | 'unchanged'; version: number | null; main?: string | null }

const NOTHING = 'We couldn’t save that. Nothing was changed.'
const FULL = 'Too many saves this minute. Nothing was changed. Try again in a minute.'
const STALE = 'The brand changed since you opened it. Reload to see it.'
// A theme shop's editor only ever sends its logo; anything else is a request no page makes.
const THEME_ONLY = NOTHING
const UNDO_MS = 60_000

const hex = z.string().max(9)
const Patch = z.strictObject({
  logos: z.strictObject(Object.fromEntries(LOGO_SLOTS.map((s) => [s, z.string().max(300).nullable().optional()])) as Record<LogoSlot, z.ZodOptional<z.ZodNullable<z.ZodString>>>).optional(),
  palette: z.strictObject(Object.fromEntries(COLOUR_ROLES.map((r) => [r, hex.optional()])) as Record<(typeof COLOUR_ROLES)[number], z.ZodOptional<typeof hex>>).optional(),
  display: z.enum(FONTS).optional(),
  body: z.enum(FONTS).optional(),
  radius: z.union(RADII.map((r) => z.literal(r)) as unknown as [z.ZodLiteral<0>, z.ZodLiteral<4>]).optional(),
  density: z.enum(DENSITIES).optional(),
})
/** `version` is the record the editor holds (null: none saved yet); left out only by a one-field caller (the Settings logo). */
const SaveInput = z.strictObject({ version: z.number().int().positive().nullable().optional(), patch: Patch })
export type BrandPatch = z.infer<typeof Patch>

/** The record a patch makes: colours normalised ("#fbf7f1" → "#FBF7F1"); a colour that isn't one stays as typed so the check names it. */
function apply(live: BrandRecord, p: BrandPatch): BrandRecord {
  const palette = { ...live.palette }
  for (const r of COLOUR_ROLES) { const v = p.palette?.[r]; if (v !== undefined) palette[r] = normalHex(v) ?? (v as `#${string}`) }
  const logos = { ...live.logos }
  for (const s of LOGO_SLOTS) { const v = p.logos?.[s]; if (v !== undefined) logos[s] = v }
  return { logos, palette, display: p.display ?? live.display, body: p.body ?? live.body, radius: p.radius ?? live.radius, density: p.density ?? live.density }
}

/** Each logo the patch sets: this store's own file, in its shape, and really in the media store. */
async function logoProblems(p: BrandPatch, tenantId: string): Promise<Partial<Record<LogoSlot, string>>> {
  const host = storeHost(BLOB_STORE_ID)
  const out: Partial<Record<LogoSlot, string>> = {}
  await Promise.all(LOGO_SLOTS.map(async (s) => {
    const v = p.logos?.[s]
    if (v === undefined || v === null) return
    const f = host ? acceptedBrandFile(v, host, tenantId) : null
    const there = f && (f.kind === 'svg' ? await svgIsStored(f.url) : await photosAreMade([{ base: rasterBase(f.url), widths: [400] }], undefined, 'brand'))
    if (!there) out[s] = 'That file could not be used. Upload it again.'
  }))
  return out
}

/** The columns of a record (the main logo lives in shop_settings.logo_url). */
const columnsOf = (b: BrandRecord) => ({
  logoMarkUrl: b.logos.mark, logoStackedUrl: b.logos.stacked, logoReversedUrl: b.logos.reversed,
  colorBg: b.palette.bg, colorPanel: b.palette.panel, colorText: b.palette.text, colorMuted: b.palette.muted, colorAccent: b.palette.accent, colorOn: b.palette.on,
  colorEdge: b.palette.edge, colorLine: b.palette.line, colorGood: b.palette.good, colorWarn: b.palette.warn, colorBad: b.palette.bad,
  fontDisplay: b.display, fontBody: b.body, radius: b.radius, density: b.density,
})

/** The store's record row, held for this transaction (null: none saved yet). */
async function heldRow(tx: Tx, t: string) {
  const [row] = await tx.select({ id: brandTokens.id, version: brandTokens.version, previous: brandTokens.previous, updatedBy: brandTokens.updatedBy, updatedAt: brandTokens.updatedAt })
    .from(brandTokens).where(eq(brandTokens.tenantId, t)).for('update')
  return row ?? null
}

/** Makes `next` live: the record before it kept for Undo, the main logo in logo_url. Returns the new version. */
async function putLive(tx: Tx, t: string, userId: string, live: BrandRecord, next: BrandRecord, row: { version: number } | null, keepPrevious = true): Promise<number> {
  const now = new Date()
  const previous = keepPrevious ? live : null
  let version: number
  if (row) {
    const [u] = await tx.update(brandTokens).set({ ...columnsOf(next), previous, version: sql`${brandTokens.version} + 1`, updatedAt: now, updatedBy: userId })
      .where(eq(brandTokens.tenantId, t)).returning({ version: brandTokens.version })
    version = u!.version
  } else {
    const [i] = await tx.insert(brandTokens).values({ tenantId: t, ...columnsOf(next), previous, updatedBy: userId }).returning({ version: brandTokens.version })
    version = i!.version
  }
  if (next.logos.main !== live.logos.main) await tx.update(shopSettings).set({ logoUrl: next.logos.main, updatedAt: now }).where(eq(shopSettings.tenantId, t))
  return version
}

/** The one door for every brand write: who, the limit, the transaction, then the cache. */
/** `pre`: the save was counted already, before its files were read (saveBrand); the transaction's own store must be it. */
async function write(what: { action: string; roles: typeof CAN_BUILD | typeof CAN_MANAGE; limit: Limit; pre?: { t: string; at: Date } }, work: (tx: Tx, auth: Auth) => Promise<Out>): Promise<BrandResult> {
  const who = await requireMember(what.roles)
  if (!who.ok) return { ok: false, error: who.message }
  // Counted before the transaction opens (speed review H1: withinLimit takes its own connection, never one inside a
  // transaction), against the member's store; the transaction checks it writes to that same store.
  let counted: { t: string; at: Date } | null = what.pre ?? null
  if (!counted) {
    const at = new Date()
    if (!(await withinLimit(what.limit, who.membership.tenantId, at, true))) return { ok: false, error: FULL }
    counted = { t: who.membership.tenantId, at }
  }
  const pre = counted
  const giveBack = async () => { if (counted) await uncount(what.limit, counted.t, counted.at).catch(() => {}) }
  let r: Awaited<ReturnType<typeof asMember<Out>>>
  try {
    r = await asMember(what.roles, { action: what.action }, async (tx, auth) => {
      if (pre.t !== auth.membership.tenantId) return { error: NOTHING }
      return work(tx, auth)
    })
  } catch (e) {
    console.error(`[${what.action}]`, errName(e))
    await giveBack()
    return { ok: false, error: NOTHING }
  }
  if (!r.ok) { await giveBack(); return r }
  if ('error' in r.value) { await giveBack(); return { ok: false, error: r.value.error, ...(r.value.fields ? { fields: r.value.fields } : {}) } }
  const { outcome, version } = r.value
  if (outcome === 'live') {
    refreshShop(r.tenantId, 'settings')
    revalidatePath('/console', 'layout')
    if (r.value.main) afterMainLogo(r.tenantId, r.value.main)
  }
  return { ok: true, outcome, version }
}

/**
 * Save a change to the brand record (or, on a theme shop, its logo). `input`: `{ version?, patch }` from the editor.
 * `action` names the audit row: `brand.save` from Console › Brand, `settings.brand.logo` from Settings (as before).
 */
export async function saveBrand(input: unknown, action: 'brand.save' | 'settings.brand.logo' = 'brand.save'): Promise<BrandResult> {
  const parsed = SaveInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: NOTHING }
  const { version, patch } = parsed.data
  const who = await requireMember(CAN_BUILD)
  if (!who.ok) return { ok: false, error: who.message }
  if (who.membership.supportSessionId) return { ok: false, error: BRAND_REFUSAL.support }
  // Counted before any file is read (security review LOW-2), and only the logo slots that change are read: the editor
  // sends all four, and a colour change reads none (architecture review). The live record here is the cached one, used
  // only to skip unchanged slots; the transaction below compares against the record it holds.
  const t0 = who.membership.tenantId, at = new Date()
  if (!(await withinLimit(LIMITS.brandSave, t0, at, true))) return { ok: false, error: FULL }
  const cached = await shopBrand(t0).catch(() => null)
  const changed: BrandPatch = { logos: Object.fromEntries(Object.entries(patch.logos ?? {}).filter(([s, v]) => v !== cached?.record.logos[s as LogoSlot])) }
  const files = await logoProblems(changed, t0)
  if (Object.keys(files).length) { await uncount(LIMITS.brandSave, t0, at).catch(() => {}); return { ok: false, error: Object.values(files)[0]!, fields: files } }
  return write({ action, roles: CAN_BUILD, limit: LIMITS.brandSave, pre: { t: t0, at } }, async (tx, auth) => {
    const t = auth.membership.tenantId, me = auth.userId, now = new Date()
    const brand = await shopBrandWith(tx, t, now)
    if (!brand) {
      // A theme shop (O19): its logo only, live, as Settings always saved it.
      const keys = Object.keys(patch).filter((k) => k !== 'logos'), slots = Object.keys(patch.logos ?? {}).filter((s) => s !== 'main')
      if (keys.length || slots.length || patch.logos?.main === undefined) return { error: THEME_ONLY }
      // A theme shop's logo stays raster: its emails, icon and markup read it as it is (architecture review).
      if (patch.logos.main && /\.svg$/.test(patch.logos.main)) return { error: 'Upload a PNG or WebP logo.', fields: { main: 'Upload a PNG or WebP logo.' } }
      await tx.update(shopSettings).set({ logoUrl: patch.logos.main, updatedAt: now }).where(eq(shopSettings.tenantId, t))
      await memberAudit(tx, auth, action, undefined, { set: patch.logos.main !== null })
      return { outcome: 'live', version: null }
    }
    const [open] = await tx.select({ at: shopSettings.publishedAt }).from(shopSettings).where(eq(shopSettings.tenantId, t))
    const saver = brandSaver(auth.membership.role, auth.membership.supportSessionId, !!open?.at)
    if (saver === 'support' || saver === 'preview') return { error: BRAND_REFUSAL[saver] }
    const row = await heldRow(tx, t)
    if (version !== undefined && version !== (row?.version ?? null)) return { error: STALE }
    const live = brand.record, next = apply(live, patch)
    const problems = brandProblems(next)
    if (problems.length) return { error: problems.length === 1 ? '1 field needs fixing' : `${problems.length} fields need fixing`, fields: Object.fromEntries(problems.map((p) => [p.field, p.message])) }
    const changes = changesOf(live, next)
    if (!changes.length) return { outcome: 'unchanged', version: row?.version ?? null }
    const fields = changes.map((c) => c.label)
    if (saver === 'waits') {
      // A newer save takes the waiting one's place (mockup screen 4): one open change a store.
      await tx.update(brandProposals).set({ decidedAt: now, decision: 'replaced', decidedBy: me }).where(and(eq(brandProposals.tenantId, t), eq(brandProposals.kind, 'brand'), isNull(brandProposals.decidedAt)))
      const [p] = await tx.insert(brandProposals).values({ tenantId: t, kind: 'brand', record: next, summary: changeSummary(changes), baseVersion: row?.version ?? 0, proposedBy: me }).returning({ id: brandProposals.id })
      await tx.execute(sql`select app_brand_notice(${p!.id}::uuid)`)
      await memberAudit(tx, auth, 'brand.propose', p!.id, { fields })
      return { outcome: 'waits', version: row?.version ?? null }
    }
    const v = await putLive(tx, t, me, live, next, row)
    await memberAudit(tx, auth, action, undefined, { fields, version: v })
    return { outcome: 'live', version: v, main: next.logos.main !== live.logos.main ? next.logos.main : undefined }
  })
}

const DecideInput = z.strictObject({ id: z.uuid(), decision: z.enum(['approve', 'decline']) })

/** The owner or a Manager says yes or no to the store's waiting change (Notices, or the card on Brand). */
export async function decideBrand(input: unknown): Promise<BrandResult> {
  const parsed = DecideInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: NOTHING }
  const { id, decision } = parsed.data
  return write({ action: `brand.${decision}`, roles: CAN_MANAGE, limit: LIMITS.brandSave }, async (tx, auth) => {
    if (!decidesBrand(auth.membership.role, auth.membership.supportSessionId)) return { error: auth.membership.supportSessionId ? BRAND_REFUSAL.support : 'Only the owner or a Manager can answer this change. Nothing was changed.' }
    const t = auth.membership.tenantId, me = auth.userId, now = new Date()
    // A checkout change is answered by decideCheckout (its own record and version); never applied as a brand record.
    const [p] = await tx.select({ id: brandProposals.id, record: brandProposals.record, base: brandProposals.baseVersion }).from(brandProposals)
      .where(and(eq(brandProposals.tenantId, t), eq(brandProposals.id, id), eq(brandProposals.kind, 'brand'), isNull(brandProposals.decidedAt))).for('update')
    if (!p) return { error: 'This change was already answered. Reload to see it.' }
    const settle = () => tx.update(brandProposals).set({ decidedAt: now, decision: decision === 'approve' ? 'approved' : 'declined', decidedBy: me })
      .where(and(eq(brandProposals.tenantId, t), eq(brandProposals.id, id)))
    if (decision === 'decline') {
      await settle()
      await memberAudit(tx, auth, 'brand.decline', id)
      return { outcome: 'unchanged', version: null }
    }
    const brand = await shopBrandWith(tx, t, now)
    const next = readRecord(p.record)
    if (!brand || !next) return { error: NOTHING }
    const row = await heldRow(tx, t)
    if ((row?.version ?? 0) !== p.base) return { error: 'Your brand changed after this was sent. Decline it and ask for a new one.' }
    if (brandProblems(next).length) return { error: NOTHING }
    const v = await putLive(tx, t, me, brand.record, next, row)
    await settle()
    await memberAudit(tx, auth, 'brand.approve', id, { fields: changesOf(brand.record, next).map((c) => c.label), version: v })
    return { outcome: 'live', version: v, main: next.logos.main !== brand.record.logos.main ? next.logos.main : undefined }
  })
}

const UndoInput = z.strictObject({ version: z.number().int().positive() })

/** Undo the last save (or Approve), by whoever made it, within a minute: the record before it, once. */
export async function undoBrand(input: unknown): Promise<BrandResult> {
  const parsed = UndoInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: NOTHING }
  return write({ action: 'brand.undo', roles: CAN_BUILD, limit: LIMITS.brandUndo }, async (tx, auth) => {
    const t = auth.membership.tenantId, now = new Date()
    if (auth.membership.supportSessionId) return { error: BRAND_REFUSAL.support }
    const row = await heldRow(tx, t)
    const before = row ? readRecord(row.previous) : null
    if (!row || !before || row.version !== parsed.data.version || row.updatedBy !== auth.userId || now.getTime() - row.updatedAt.getTime() > UNDO_MS) {
      return { error: 'That can’t be undone now. Nothing was changed.' }
    }
    const brand = await shopBrandWith(tx, t, now)
    if (!brand) return { error: NOTHING }
    const v = await putLive(tx, t, auth.userId, brand.record, before, row, false)
    await memberAudit(tx, auth, 'brand.undo', undefined, { fields: changesOf(brand.record, before).map((c) => c.label), version: v })
    return { outcome: 'live', version: v, main: before.logos.main !== brand.record.logos.main ? before.logos.main : undefined }
  })
}
