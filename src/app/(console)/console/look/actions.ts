'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { acceptedBase, storeHost } from '@/domains/media/sizes'
import { manifestOf, latestOf } from '@/domains/themes/catalogue'
import { brandColourProblem, carryOver, layerProblems } from '@/domains/themes/layer'
import { readinessOf } from '@/domains/themes/readiness'
import { resolveTheme } from '@/domains/themes/resolve'
import { SectionSchema } from '@/domains/themes/sections'
import { THEME_KEYS } from '@/lib/db/schema-themes'
import { asMember } from '@/lib/auth/as-member'
import { CAN_BUILD, CAN_MANAGE } from '@/lib/auth/require-member'
import { auditEvents } from '@/lib/db/schema'
import { BLOB_STORE_ID } from '@/lib/env'
import { refreshShop } from '@/lib/queries/storefront'
import { lookFacts } from '@/lib/themes/facts'
import { discardDraft, lookFor, newDraft, publishRevision, revisionOf, saveDraft, undoPublish } from '@/lib/themes/look'

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

/** Every photo a layer names, rebuilt by acceptedBase for THIS shop's theme folder; one that isn't refuses the save. */
function cleanImages(layer: { home?: unknown[] }, tenantId: string): { home?: unknown[] } | null {
  const host = storeHost(BLOB_STORE_ID)
  const fix = (img: { base: string } | null | undefined) => {
    if (!img) return img
    const base = host ? acceptedBase(img.base, host, tenantId, 'theme') : null
    if (!base) throw new Error('image')
    return { ...img, base }
  }
  try {
    const home = layer.home?.map((raw) => {
      const p = SectionSchema.safeParse(raw)
      if (!p.success) return raw
      const s = p.data
      if (s.key === 'hero' || s.key === 'image_text' || s.key === 'drop_teaser') return { ...s, image: fix(s.image) }
      if (s.key === 'logos') return { ...s, images: s.images.map((i) => fix(i)!) }
      return s
    })
    return { ...layer, ...(home ? { home } : {}) }
  } catch { return null }
}

export async function tryThemeAction(input: unknown): Promise<R<{ revisionId: string; lost: string[] }>> {
  const p = z.object({ theme: z.enum(THEME_KEYS) }).safeParse(input)
  if (!p.success) return { ok: false, error: 'Unknown theme.' }
  const to = latestOf(p.data.theme)!
  const r = await asMember(CAN_BUILD, { action: 'look.try', target: to.key }, async (tx, auth) => {
    if (auth.membership.supportSessionId) return { error: SUPPORT }
    const t = auth.membership.tenantId
    const l = await lookFor(tx, t)
    const from = l.draft ?? l.live?.revision ?? null
    const fromM = from ? manifestOf(from.themeKey, from.themeVersion) : null
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

const Save = z.object({ revisionId: z.uuid(), version: z.number().int().positive(), style: z.string().regex(/^[a-z0-9-]{1,40}$/), layer: z.object({ settings: z.unknown(), home: z.array(z.unknown()).optional() }) })

export async function saveLookAction(input: unknown): Promise<R<{ version: number }>> {
  const p = Save.safeParse(input)
  if (!p.success) return { ok: false, error: 'That change could not be saved.' }
  const problems = layerProblems(p.data.layer)
  if (problems.length) return { ok: false, error: problems[0]! }
  const r = await asMember(CAN_BUILD, { action: 'look.save' }, async (tx, auth) => {
    if (auth.membership.supportSessionId) return { error: SUPPORT }
    const t = auth.membership.tenantId
    const rev = await revisionOf(tx, t, p.data.revisionId)
    if (!rev) return { error: 'This draft is gone. Reload.' }
    const m = manifestOf(rev.themeKey, rev.themeVersion)
    if (!m || !m.styles.some((s) => s.key === p.data.style)) return { error: 'Unknown style.' }
    const layer = p.data.layer as { settings?: { brandColour?: string | null }; home?: unknown[] }
    const colour = layer.settings?.brandColour
    if (colour) { const sch = resolveTheme(m, { style: p.data.style }).schemes; const why = brandColourProblem(colour, [sch.paper, sch.tint]); if (why) return { error: why } }
    const clean = cleanImages(layer, t)
    if (!clean) return { error: 'A photo didn’t come from this shop. Upload it again.' }
    const s = await saveDraft(tx, t, { userId: auth.userId, email: auth.email }, { revisionId: rev.id, version: p.data.version, styleKey: p.data.style, settings: clean })
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
  const r = await asMember(CAN_MANAGE, { action: 'look.publish' }, async (tx, auth) => {
    if (auth.membership.supportSessionId) return { error: SUPPORT }
    const t = auth.membership.tenantId
    const rev = await revisionOf(tx, t, p.data.revisionId)
    if (!rev) return { error: 'This draft is gone. Reload.' }
    const m = manifestOf(rev.themeKey, rev.themeVersion)
    if (!m) return { error: 'This theme isn’t available.' }
    const layer = rev.settings as { settings?: object; home?: unknown[] }
    const theme = resolveTheme(m, { style: rev.styleKey, ...layer })
    const facts = await lookFacts(tx, t)
    const blocking = readinessOf(theme.home, facts, new Date()).filter((i) => i.blocks)
    if (blocking.length) return { error: `Before publishing: ${blocking[0]!.text}.` }
    const out = await publishRevision(tx, t, { userId: auth.userId, email: auth.email }, {
      revisionId: rev.id, version: p.data.version,
      baseline: () => ({ themeKey: 'classic', themeVersion: '1.0.0', styleKey: facts.accent, settings: { settings: { pairing: facts.displayFont } } }),
    })
    if (out !== 'ok') return { error: out === 'stale' ? 'The draft changed after you opened Publish. Look again, then publish.' : 'This draft is gone. Reload.' }
    await audit(tx, auth, 'look.publish', `${m.name} · ${rev.styleKey}`)
    return {}
  })
  if (!r.ok) return r
  if ('error' in r.value) return { ok: false, error: r.value.error as string }
  refreshShop(r.tenantId, 'shop')
  revalidatePath('/console/look')
  return { ok: true }
}

export async function undoPublishAction(): Promise<R> {
  const r = await asMember(CAN_MANAGE, { action: 'look.undo' }, async (tx, auth) => {
    if (auth.membership.supportSessionId) return { error: SUPPORT }
    const back = await undoPublish(tx, auth.membership.tenantId, { userId: auth.userId, email: auth.email })
    if (!back) return { error: 'There is no earlier look.' }
    await audit(tx, auth, 'look.undo')
    return {}
  })
  if (!r.ok) return r
  if ('error' in r.value) return { ok: false, error: r.value.error as string }
  refreshShop(r.tenantId, 'shop')
  revalidatePath('/console/look')
  return { ok: true }
}

/** Restore: a new draft copied from one of this shop's earlier looks (nothing changes for shoppers until Publish). */
export async function restoreLookAction(input: unknown): Promise<R<{ revisionId: string }>> {
  const p = z.object({ revisionId: z.uuid() }).safeParse(input)
  if (!p.success) return { ok: false, error: 'Unknown look.' }
  const r = await asMember(CAN_BUILD, { action: 'look.restore' }, async (tx, auth) => {
    if (auth.membership.supportSessionId) return { error: SUPPORT }
    const t = auth.membership.tenantId
    const from = await revisionOf(tx, t, p.data.revisionId)
    if (!from || !manifestOf(from.themeKey, from.themeVersion)) return { error: 'That look can’t be restored.' }
    const d = await newDraft(tx, t, { userId: auth.userId, email: auth.email }, { themeKey: from.themeKey, themeVersion: from.themeVersion, styleKey: from.styleKey, settings: from.settings as object })
    return { revisionId: d.id }
  })
  if (!r.ok) return r
  if ('error' in r.value) return { ok: false, error: r.value.error as string }
  revalidatePath('/console/look')
  return { ok: true, revisionId: r.value.revisionId as string }
}

/** The draft to edit: the open one, else a new one copied from the live look. */
export async function editLookAction(): Promise<R<{ revisionId: string }>> {
  const r = await asMember(CAN_BUILD, { action: 'look.edit' }, async (tx, auth) => {
    if (auth.membership.supportSessionId) return { error: SUPPORT }
    const t = auth.membership.tenantId
    const l = await lookFor(tx, t)
    if (l.draft) return { revisionId: l.draft.id }
    const facts = await lookFacts(tx, t)
    const base = l.live?.revision ?? null
    const d = await newDraft(tx, t, { userId: auth.userId, email: auth.email }, base
      ? { themeKey: base.themeKey, themeVersion: base.themeVersion, styleKey: base.styleKey, settings: base.settings as object }
      : { themeKey: 'classic', themeVersion: '1.0.0', styleKey: facts.accent, settings: { settings: { pairing: facts.displayFont } } })
    return { revisionId: d.id }
  })
  if (!r.ok) return r
  if ('error' in r.value) return { ok: false, error: r.value.error as string }
  return { ok: true, revisionId: r.value.revisionId as string }
}

export async function discardDraftAction(): Promise<R> {
  const r = await asMember(CAN_BUILD, { action: 'look.discard' }, async (tx, auth) => {
    if (auth.membership.supportSessionId) return { error: SUPPORT }
    return (await discardDraft(tx, auth.membership.tenantId)) ? {} : { error: 'There is no draft.' }
  })
  if (!r.ok) return r
  if ('error' in r.value) return { ok: false, error: r.value.error as string }
  revalidatePath('/console/look')
  return { ok: true }
}
