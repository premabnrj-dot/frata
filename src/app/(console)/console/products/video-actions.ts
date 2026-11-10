'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { uploadProblem, VIDEO_TYPES } from '@/domains/video/state'
import { asModule } from '@/lib/auth/as-module'
import { asMember } from '@/lib/auth/as-member'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { LIMITS, overLimit, withinLimit } from '@/lib/db/rate-limit'
import { isVideoConfigured, MUX_ENVIRONMENT_ID } from '@/lib/env'
import { errName } from '@/lib/log'
import { drainSoon } from '@/lib/outbox/drain'
import { CONSOLE_HOST } from '@/lib/public-env'
import { failVideo, productOfShop, productVideoFor, productVideoOf, setProductVideo, setUpload, startVideo, unlinkProductVideo } from '@/lib/queries/videos'
import { refreshProduct } from '@/lib/storefront/refresh'
import { createUpload } from '@/lib/video/mux'
import { BUTTONS, productVideoView, type ProductVideoView } from '@/lib/video/product-view'

// =============================================================================
// FILE: products/video-actions.ts — a product's video (PV·1, docs/plans/2026-11-10-product-video-pv1.md). Any member
// who edits products (as photos), never in a support visit, only while the Product video module is usable. The
// product comes from the shop's own rows by id; the tenant from the session. Start: the row (use = 'product') and its
// link are committed together under the shop's lock BEFORE Mux is asked (ADR-0008); deletes and cancels are outbox
// rows in the same transaction (ADR-0006). The browser gets the upload URL and our ids, nothing else.
// =============================================================================

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string }
const SUPPORT = 'Support visits can look but not change videos.'
const BUSY = 'Too many videos in the last few minutes. Try again shortly.'
const NOT_STARTED = 'Video didn’t start. Try again in a minute.'
const id = z.uuid()

async function consoleOrigin(): Promise<string> {
  const o = (await headers()).get('origin')
  try { if (o && new URL(o).hostname === CONSOLE_HOST) return new URL(o).origin } catch { /* fall through */ }
  return `https://${CONSOLE_HOST}`
}

/** Start an upload. `replaces` (the video now on the product) is removed in the same transaction: Replace was confirmed. */
export async function startProductVideoAction(input: unknown): Promise<R<{ videoId: string; url: string }>> {
  const p = z.object({ productId: id, contentType: z.enum(VIDEO_TYPES), size: z.number().int().positive().max(1e10), replaces: id.optional() }).safeParse(input)
  if (!p.success) return { ok: false, error: 'Choose an MP4 or MOV video.' }
  const why = uploadProblem(p.data.contentType, p.data.size, 'product')
  if (why) return { ok: false, error: why }
  if (!isVideoConfigured()) return { ok: false, error: 'Video isn’t switched on for shops yet.' }
  const now = new Date()
  // Who, and the limits, before the transaction (a limit is its own connection; speed review P4).
  const me = await requireMember(ANY_MEMBER)
  if (!me.ok) return { ok: false, error: me.message }
  if (me.membership.supportSessionId) return { ok: false, error: SUPPORT }
  if (!(await withinLimit(LIMITS.videoStartMember, me.userId, now, true)) || (await overLimit(LIMITS.videoStartAll, 'all', now, true))) return { ok: false, error: BUSY }
  const r = await asModule('product_video', ANY_MEMBER, { action: 'product.video.start', target: p.data.productId }, async (tx, auth) => {
    const tenantId = auth.membership.tenantId
    const product = await productOfShop(tx, tenantId, p.data.productId)
    if (!product) return { error: 'That product isn’t in your shop.' }
    // One per product, the caps, the row and its link: all under the shop's lock, refusals before the insert.
    const s0 = await startVideo(tx, tenantId, auth.userId, MUX_ENVIRONMENT_ID, now, 'product', { productId: product.id, replaces: p.data.replaces })
    if (!s0.ok) return { error: s0.error }
    return { id: s0.id, handle: product.handle, replaced: !!s0.replaced }
  })
  if (!r.ok) return r
  if ('error' in r.value) return { ok: false, error: r.value.error as string }
  await withinLimit(LIMITS.videoStartAll, 'all', now, true)
  const { id: videoId, handle, replaced } = r.value
  if (replaced) { refreshProduct(r.tenantId, handle); drainSoon() }
  const up = await createUpload(videoId, await consoleOrigin(), 'product').catch((e) => { console.error('[product-video] upload', errName(e)); return { ok: false as const, why: 'unavailable' as const } })
  const w = await asMember(ANY_MEMBER, { action: 'product.video.upload', target: p.data.productId }, async (tx, auth) => {
    if (up.ok) await setUpload(tx, auth.membership.tenantId, videoId, up.uploadId)
    else await failVideo(tx, auth.membership.tenantId, videoId, `upload_${up.why}`, new Date())
    return {}
  })
  if (!up.ok) return { ok: false, error: up.why === 'rate_limited' ? BUSY : NOT_STARTED }
  if (!w.ok) return { ok: false, error: NOT_STARTED }
  return { ok: true, videoId, url: up.url }
}

/** Cancel while uploading, Remove, or Choose another after it failed: the link goes, the row is removed, Mux queued. */
export async function removeProductVideoAction(input: unknown): Promise<R> {
  const p = z.object({ productId: id }).safeParse(input)
  if (!p.success) return { ok: false, error: 'Nothing to remove.' }
  // Not asModule: a paused module must still let a shop take its video down.
  const r = await asMember(ANY_MEMBER, { action: 'product.video.remove', target: p.data.productId }, async (tx, auth) => {
    if (auth.membership.supportSessionId) return { error: SUPPORT }
    const tenantId = auth.membership.tenantId
    const product = await productOfShop(tx, tenantId, p.data.productId)
    if (!product) return { error: 'Nothing to remove.' }
    const gone = await unlinkProductVideo(tx, tenantId, product.id, new Date())
    return { handle: product.handle, gone }
  })
  if (!r.ok) return r
  if ('error' in r.value) return { ok: false, error: r.value.error as string }
  if (r.value.gone) { refreshProduct(r.tenantId, r.value.handle); drainSoon() }
  return { ok: true }
}

/** The cover frame and the button's words (fixed values, never free text). */
export async function setProductVideoAction(input: unknown): Promise<R> {
  const p = z.object({ productId: id, posterMs: z.number().int().min(0).max(60_000).optional(), button: z.enum(BUTTONS as ['model', 'wear', 'none']).optional() })
    .refine((x) => x.posterMs !== undefined || x.button !== undefined).safeParse(input)
  if (!p.success) return { ok: false, error: 'Nothing to change.' }
  const r = await asModule('product_video', ANY_MEMBER, { action: 'product.video.set', target: p.data.productId, detail: { button: p.data.button } }, async (tx, auth) => {
    if (auth.membership.supportSessionId) return { error: SUPPORT }
    const tenantId = auth.membership.tenantId
    const product = await productOfShop(tx, tenantId, p.data.productId)
    const v = product ? await productVideoFor(tx, tenantId, product.id) : null
    if (!product || !v || v.removedAt) return { error: 'This product has no video.' }
    if (p.data.posterMs !== undefined && v.durationMs !== null && p.data.posterMs > v.durationMs) return { error: 'Choose a frame inside the video.' }
    const change: { posterMs?: number; button?: string } = {}
    if (p.data.posterMs !== undefined && p.data.posterMs !== v.posterMs) change.posterMs = p.data.posterMs
    if (p.data.button !== undefined && p.data.button !== v.button) change.button = p.data.button
    // Nothing changed: no write, and the product's cached page is left alone (security review LOW-1).
    if (!Object.keys(change).length) return { handle: null }
    await setProductVideo(tx, tenantId, product.id, change)
    return { handle: product.handle }
  })
  if (!r.ok) return r
  if ('error' in r.value) return { ok: false, error: r.value.error as string }
  if (r.value.handle) refreshProduct(r.tenantId, r.value.handle)
  return { ok: true }
}

/** The card asks while a video is getting ready (polled with backoff); derived from the row, so a reload agrees. */
export async function productVideoStatusAction(input: unknown): Promise<R<{ video: ProductVideoView | null }>> {
  const p = z.object({ productId: id }).safeParse(input)
  if (!p.success) return { ok: false, error: 'Unknown product.' }
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return { ok: false, error: auth.message }
  const tenantId = auth.membership.tenantId
  const v = await productVideoOf(tenantId, p.data.productId)
  return { ok: true, video: v ? productVideoView(v, new Date()) : null }
}

