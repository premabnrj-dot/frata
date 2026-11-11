'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { storeHost } from '@/domains/media/sizes'
import { cleanImages } from '@/domains/themes/clean-images'
import { manifestNear, manifestOf, type ManifestSource } from '@/domains/themes/source'
import { latestAvailable } from '@/domains/themes/release'
import { brandColourProblem, carryOver, LayerSchema, layerProblems, layerTooLong } from '@/domains/themes/layer'
import { readinessOf } from '@/domains/themes/readiness'
import { designsForSave, designsOf } from '@/domains/themes/blocks'
import { paletteProblem, type Palette } from '@/domains/themes/site'
import { baselineRevision, resolveTheme } from '@/domains/themes/resolve'
import { THEME_KEYS } from '@/lib/db/schema-themes'
import { asMember } from '@/lib/auth/as-member'
import { CAN_BUILD, CAN_MANAGE, requireMember } from '@/lib/auth/require-member'
import { manifestsFor } from '@/lib/themes/manifests'
import { auditEvents } from '@/lib/db/schema'
import { BLOB_STORE_ID } from '@/lib/env'
import { refreshShop } from '@/lib/queries/storefront'
import { lookFacts } from '@/lib/themes/facts'
import { drainSoon } from '@/lib/outbox/drain'
import { cleanVideos, releaseUnusedVideos } from '@/lib/queries/videos'
import { discardDraft, lookFor, newDraft, publishRevision, revisionOf, saveDraft, themeAccess, undoPublish } from '@/lib/themes/look'

// =============================================================================
// Console › Look (themes spec § Revisions; plan § Review findings). Editing a draft: owner, admin or partner
// (CAN_BUILD). Publishing, Undo after publish: owner or admin. Never a Frrata support visit (it is the brand's own
// shop front; support's role reads as owner, so it is refused by its session, not its role). Every write names the
// revision it acts on, found only under the member's own shop.
// =============================================================================

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string }
const SUPPORT = 'Frrata support can look, not change the shop’s look.'

const audit = (tx: Parameters<Parameters<typeof asMember>[2]>[0], a: { membership: { tenantId: string }; userId: string; email: string | null }, action: string, target?: string) =>
  tx.insert(auditEvents).values({ tenantId: a.membership.tenantId, actorUserId: a.userId, actorEmail: a.email, actorKind: 'member', action, target: target ?? null })


/** The member's shop's manifests, read BEFORE the transaction (P4); requireMember is cached, so this costs no query. */
async function sourceFor(roles: Parameters<typeof requireMember>[0]): Promise<ManifestSource> {
  const a = await requireMember(roles)
  return manifestsFor(a.ok ? a.membership.tenantId : null)
}

export async function tryThemeAction(input: unknown): Promise<R<{ revisionId: string; lost: string[] }>> {
  const p = z.object({ theme: z.enum(THEME_KEYS) }).safeParse(input)
  if (!p.success) { console.error('[look.try] refused', typeof input === 'object' && input ? String((input as { theme?: unknown }).theme).slice(0, 40) : typeof input); return { ok: false, error: 'Unknown theme.' } }
  const src = await sourceFor(CAN_BUILD)
  const r = await asMember(CAN_BUILD, { action: 'look.try', target: p.data.theme }, async (tx, auth) => {
    if (auth.membership.supportSessionId) return { error: SUPPORT }
    const t = auth.membership.tenantId
    const l = await lookFor(tx, t)
    // The newest version this shop may use (released, or staged to it; never recalled or withdrawn: T3).
    const to = latestAvailable(p.data.theme, src.versions(p.data.theme), l.access.rows, l.access.staged)
    if (!to) return { error: 'This theme isn’t available right now.' }
    const from = l.draft ?? l.live?.revision ?? null
    const fromM = from ? manifestNear(src, from.themeKey, from.themeVersion) : null
    const fromLayer = from ? (from.settings as { settings?: object; home?: unknown[] }) : {}
    const c = fromM && from ? carryOver({ manifest: fromM, layer: { style: from.styleKey, ...fromLayer } }, to) : { layer: { style: to.styles[0]!.key }, lost: [] }
    const { style, ...rest } = c.layer
    const d = await newDraft(tx, t, { userId: auth.userId, email: auth.email }, { themeKey: to.key, themeVersion: to.version, styleKey: style, settings: rest })
    return { revisionId: d.id, lost: c.lost }
  })
  if (!r.ok) return r
  if ('error' in r.value) return { ok: false, error: r.value.error as string }
  revalidatePath('/console/look')
  return { ok: true, ...r.value }
}

const Save = z.object({ revisionId: z.uuid(), version: z.number().int().positive(), style: z.string().regex(/^[a-z0-9-]{1,40}$/), layer: z.object({ settings: z.unknown(), home: z.array(z.unknown()).optional(), site: z.unknown().optional(), menus: z.unknown().optional() }) })

export async function saveLookAction(input: unknown): Promise<R<{ version: number }>> {
  const p = Save.safeParse(input)
  if (!p.success) return { ok: false, error: 'That change could not be saved.' }
  const problems = layerProblems(p.data.layer)
  if (problems.length) return { ok: false, error: problems[0]! }
  const src = await sourceFor(CAN_BUILD)
  const r = await asMember(CAN_BUILD, { action: 'look.save' }, async (tx, auth) => {
    if (auth.membership.supportSessionId) return { error: SUPPORT }
    const t = auth.membership.tenantId
    const rev = await revisionOf(tx, t, p.data.revisionId)
    if (!rev) return { error: 'This draft is gone. Reload.' }
    const m = manifestOf(src, rev.themeKey, rev.themeVersion)
    if (!m || !m.styles.some((s) => s.key === p.data.style)) return { error: 'Unknown style.' }
    const layer = p.data.layer as { settings?: { brandColour?: string | null }; home?: unknown[] }
    const colour = layer.settings?.brandColour
    if (colour) { const sch = resolveTheme(m, { style: p.data.style }).schemes; const why = brandColourProblem(colour, [sch.paper, sch.tint]); if (why) return { error: why } }
    // A palette must read with what it keeps from this style (sale and saving words, the tint).
    const pal = (p.data.layer.site as { palette?: Palette | null } | undefined)?.palette
    if (pal) { const sch = resolveTheme(m, { style: p.data.style }).schemes; const why = paletteProblem({ ...pal }, [sch.paper, sch.tint]); if (why) return { error: why } }
    // TS0b: each design's words pruned to its blocks, then the page's limits (after the manifest is read: architecture 8).
    const designed = designsForSave(designsOf(m), layer.home ?? [])
    if ('error' in designed) return { error: designed.error }
    if (layer.home) layer.home = designed.home
    // Stored as parsed: unknown settings keys are dropped (tenancy audit 2026-11-08).
    const parsed = LayerSchema.parse(layer)
    const clean = cleanImages({ ...layer, settings: parsed.settings, ...(parsed.site ? { site: parsed.site } : {}), ...(parsed.menus ? { menus: parsed.menus } : {}) }, t, storeHost(BLOB_STORE_ID))
    if (!clean) return { error: 'A photo didn’t come from this shop. Upload it again.' }
    // V1: a video id must be one of this shop's own, not removed; anything else is dropped (the photo shows).
    const kept = await cleanVideos(tx, t, clean)
    // The revision holds at most 64 kB (the database check, in bytes): say so in words before the insert would fail.
    if (layerTooLong(kept)) return { error: 'This look is too long to save. Shorten some words, or remove a section.' }
    const s = await saveDraft(tx, t, { userId: auth.userId, email: auth.email }, { revisionId: rev.id, version: p.data.version, styleKey: p.data.style, settings: kept })
    if (!s.ok) return { error: s.why === 'stale' ? `${rev.updatedByEmail ?? 'Someone'} changed this draft a moment ago. Reload to see their changes.` : s.why === 'published' ? 'This look was published. Reload to keep editing.' : 'This draft is gone. Reload.' }
    return { version: s.version }
  })
  if (!r.ok) return r
  if ('error' in r.value) return { ok: false, error: r.value.error as string }
  return { ok: true, version: r.value.version }
}

export async function publishLookAction(input: unknown): Promise<R> {
  const p = z.object({ revisionId: z.uuid(), version: z.number().int().positive() }).safeParse(input)
  if (!p.success) return { ok: false, error: 'Nothing to publish.' }
  const src = await sourceFor(CAN_MANAGE)
  const r = await asMember(CAN_MANAGE, { action: 'look.publish' }, async (tx, auth) => {
    if (auth.membership.supportSessionId) return { error: SUPPORT }
    const t = auth.membership.tenantId
    const rev = await revisionOf(tx, t, p.data.revisionId)
    if (!rev) return { error: 'This draft is gone. Reload.' }
    const m = manifestOf(src, rev.themeKey, rev.themeVersion)
    if (!m) return { error: 'This theme isn’t available.' }
    const layer = rev.settings as { settings?: object; home?: unknown[] }
    const theme = resolveTheme(m, { style: rev.styleKey, ...layer })
    const facts = await lookFacts(tx, t)
    const blocking = readinessOf(theme.home, facts, new Date(), theme.designs).filter((i) => i.blocks)
    if (blocking.length) return { error: `Before publishing: ${blocking[0]!.text}.` }
    const out = await publishRevision(tx, t, { userId: auth.userId, email: auth.email }, {
      revisionId: rev.id, version: p.data.version,
      baseline: () => baselineRevision(facts.accent, facts.displayFont),
    })
    if (out !== 'ok') return { error: out === 'stale' ? 'The draft changed after you opened Publish. Look again, then publish.' : out === 'unavailable' ? `${m.name} ${rev.themeVersion} isn’t offered by Frrata any more, so it can’t be published. Try the theme again for its current version, or restore an earlier look.` : 'This draft is gone. Reload.' }
    await audit(tx, auth, 'look.publish', `${m.name} · ${rev.styleKey}`)
    // V1: videos no stored look uses any more are removed now, their Mux side queued in this transaction.
    return { freed: await releaseUnusedVideos(tx, t, new Date()) }
  })
  if (!r.ok) return r
  if ('error' in r.value) return { ok: false, error: r.value.error as string }
  if (r.value.freed) drainSoon()
  refreshShop(r.tenantId, 'look')
  revalidatePath('/console/look')
  return { ok: true }
}

/** Undo last publish, from the live look the person saw (`live`): another publish since refuses. */
export async function undoPublishAction(input: unknown): Promise<R> {
  const p = z.object({ live: z.uuid() }).safeParse(input)
  if (!p.success) return { ok: false, error: 'Reload, then undo.' }
  const r = await asMember(CAN_MANAGE, { action: 'look.undo' }, async (tx, auth) => {
    if (auth.membership.supportSessionId) return { error: SUPPORT }
    const back = await undoPublish(tx, auth.membership.tenantId, { userId: auth.userId, email: auth.email }, p.data.live)
    if (back === 'moved') return { error: 'Someone published since. Reload to see the look shoppers have now.' }
    if (back === 'none') return { error: 'There is no earlier look.' }
    await audit(tx, auth, 'look.undo')
    return {}
  })
  if (!r.ok) return r
  if ('error' in r.value) return { ok: false, error: r.value.error as string }
  refreshShop(r.tenantId, 'look')
  revalidatePath('/console/look')
  return { ok: true }
}

/** Restore: a new draft copied from one of this shop's earlier looks (nothing changes for shoppers until Publish). */
export async function restoreLookAction(input: unknown): Promise<R<{ revisionId: string }>> {
  const p = z.object({ revisionId: z.uuid() }).safeParse(input)
  if (!p.success) return { ok: false, error: 'Unknown look.' }
  const src = await sourceFor(CAN_BUILD)
  const r = await asMember(CAN_BUILD, { action: 'look.restore' }, async (tx, auth) => {
    if (auth.membership.supportSessionId) return { error: SUPPORT }
    const t = auth.membership.tenantId
    const from = await revisionOf(tx, t, p.data.revisionId)
    if (!from || !manifestOf(src, from.themeKey, from.themeVersion)) return { error: 'That look can’t be restored.' }
    if (!(await themeAccess(tx, t)).may(from.themeKey, from.themeVersion)) return { error: 'That look’s theme version isn’t offered by Frrata any more, so it can’t be restored. Try the theme for its current version.' }
    const d = await newDraft(tx, t, { userId: auth.userId, email: auth.email }, { themeKey: from.themeKey, themeVersion: from.themeVersion, styleKey: from.styleKey, settings: from.settings as object })
    return { revisionId: d.id }
  })
  if (!r.ok) return r
  if ('error' in r.value) return { ok: false, error: r.value.error as string }
  revalidatePath('/console/look')
  return { ok: true, revisionId: r.value.revisionId as string }
}

/** The draft to edit: the open one, else a new one copied from the live look. */
export async function editLookAction(): Promise<R<{ revisionId: string; lost: string[] }>> {
  const src = await sourceFor(CAN_BUILD)
  const r = await asMember(CAN_BUILD, { action: 'look.edit' }, async (tx, auth) => {
    if (auth.membership.supportSessionId) return { error: SUPPORT }
    const t = auth.membership.tenantId
    const l = await lookFor(tx, t)
    if (l.draft) return { revisionId: l.draft.id, lost: [] as string[] }
    let lost: string[] = []
    const facts = await lookFacts(tx, t)
    const base = l.live?.revision ?? null
    // A live look on a recalled version starts its draft on the newest version of that theme the shop may use (the
    // same theme: everything comes across), else on the baseline (T3).
    const start = !base ? baselineRevision(facts.accent, facts.displayFont)
      : l.may(base.themeKey, base.themeVersion) ? { themeKey: base.themeKey, themeVersion: base.themeVersion, styleKey: base.styleKey, settings: base.settings as object }
        : (() => {
          const to = latestAvailable(base.themeKey, src.versions(base.themeKey), l.access.rows, l.access.staged)
          const fromM = manifestNear(src, base.themeKey, base.themeVersion)
          if (!to || !fromM) return baselineRevision(facts.accent, facts.displayFont)
          const c = carryOver({ manifest: fromM, layer: { style: base.styleKey, ...(base.settings as object) } }, to)
          lost = c.lost
          const { style, ...rest } = c.layer
          return { themeKey: to.key, themeVersion: to.version, styleKey: style, settings: rest }
        })()
    // reuse: a draft another tab opened since the read above is kept, not replaced (impact review 2026-11-08).
    const d = await newDraft(tx, t, { userId: auth.userId, email: auth.email }, start, { reuse: true })
    return { revisionId: d.id, lost }
  })
  if (!r.ok) return r
  if ('error' in r.value) return { ok: false, error: r.value.error as string }
  return { ok: true, revisionId: r.value.revisionId as string, lost: (r.value.lost as string[]) ?? [] }
}

export async function discardDraftAction(): Promise<R> {
  const r = await asMember(CAN_BUILD, { action: 'look.discard' }, async (tx, auth) => {
    if (auth.membership.supportSessionId) return { error: SUPPORT }
    if (!(await discardDraft(tx, auth.membership.tenantId))) return { error: 'There is no draft.' }
    return { freed: await releaseUnusedVideos(tx, auth.membership.tenantId, new Date()) }
  })
  if (!r.ok) return r
  if ('error' in r.value) return { ok: false, error: r.value.error as string }
  if (r.value.freed) drainSoon()
  revalidatePath('/console/look')
  return { ok: true }
}
