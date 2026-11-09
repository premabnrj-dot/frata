'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { uploadProblem, VIDEO_TYPES } from '@/domains/video/state'
import { asMember } from '@/lib/auth/as-member'
import { CAN_BUILD, requireMember } from '@/lib/auth/require-member'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { isVideoConfigured, MUX_ENVIRONMENT_ID, MUX_IMAGE_BASE } from '@/lib/env'
import { errName } from '@/lib/log'
import { drainSoon } from '@/lib/outbox/drain'
import { CONSOLE_HOST } from '@/lib/public-env'
import { failVideo, removeVideo, setUpload, startVideo, videoOf, videoStatusFor } from '@/lib/queries/videos'
import { createUpload } from '@/lib/video/mux'

// =============================================================================
// FILE: look/video-actions.ts — a video for a Hero or an Image with text (V1, docs/plans/2026-11-09-video-v1.md).
// The look's builders only (CAN_BUILD), never in a support visit. Start: the row is committed BEFORE Mux is asked for
// the upload (ADR-0008), under the shop's caps, the member's and Frrata's limits (fail closed); the browser gets the
// upload URL and our video id, nothing else, and sends the file straight to Mux. Replace and Remove are draft edits
// (the section's `video`); nothing is deleted until publish or discard (queries/videos.ts releaseUnusedVideos).
// =============================================================================

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string }
const SUPPORT = 'Support visits can look but not change videos.'
const BUSY = 'Too many videos in the last few minutes. Try again shortly.'

/** The console's origin, for Mux's CORS: the request's own, when it is the console; else the configured host. */
async function consoleOrigin(): Promise<string> {
  const o = (await headers()).get('origin')
  try { if (o && new URL(o).hostname === CONSOLE_HOST) return new URL(o).origin } catch { /* fall through */ }
  return `https://${CONSOLE_HOST}`
}

export async function startVideoUploadAction(input: unknown): Promise<R<{ videoId: string; url: string }>> {
  const p = z.object({ contentType: z.enum(VIDEO_TYPES), size: z.number().int().positive().max(1e10) }).safeParse(input)
  if (!p.success) return { ok: false, error: 'Choose an MP4 or MOV video.' }
  const why = uploadProblem(p.data.contentType, p.data.size)
  if (why) return { ok: false, error: why }
  if (!isVideoConfigured()) return { ok: false, error: 'Video isn’t switched on for shops yet.' }
  const now = new Date()
  const r = await asMember(CAN_BUILD, { action: 'video.start' }, async (tx, auth) => {
    if (auth.membership.supportSessionId) return { error: SUPPORT }
    if (!(await withinLimit(LIMITS.videoStartMember, auth.userId, now, true)) || !(await withinLimit(LIMITS.videoStartAll, 'all', now, true))) return { error: BUSY }
    const s = await startVideo(tx, auth.membership.tenantId, auth.userId, MUX_ENVIRONMENT_ID, now)
    return s.ok ? { id: s.id } : { error: s.error }
  })
  if (!r.ok) return r
  if ('error' in r.value) return { ok: false, error: r.value.error as string }
  const videoId = r.value.id
  // The row is committed; now the call. Its outcome is written in its own transaction either way.
  const up = await createUpload(videoId, await consoleOrigin()).catch((e) => { console.error('[video] upload', errName(e)); return { ok: false as const, why: 'unavailable' as const } })
  const w = await asMember(CAN_BUILD, { action: 'video.upload' }, async (tx) => {
    if (up.ok) await setUpload(tx, videoId, up.uploadId)
    else await failVideo(tx, videoId, `upload_${up.why}`, new Date())
    return {}
  })
  if (!up.ok) return { ok: false, error: up.why === 'rate_limited' ? BUSY : 'Video didn’t start. Try again in a minute.' }
  if (!w.ok) return { ok: false, error: 'Video didn’t start. Try again in a minute.' }
  return { ok: true, videoId, url: up.url }
}

/** Cancel while uploading: the row is removed and Mux's upload URL is closed (outbox), so nothing arrives later. */
export async function cancelVideoUploadAction(input: unknown): Promise<R> {
  const p = z.object({ id: z.uuid() }).safeParse(input)
  if (!p.success) return { ok: false, error: 'Nothing to cancel.' }
  const r = await asMember(CAN_BUILD, { action: 'video.cancel' }, async (tx, auth) => {
    if (auth.membership.supportSessionId) return { error: SUPPORT }
    const v = await videoOf(tx, p.data.id)
    if (!v) return { error: 'Nothing to cancel.' }
    if (v.readyAt || v.removedAt) return {}
    await removeVideo(tx, auth.membership.tenantId, v, new Date())
    return { queued: true }
  })
  if (!r.ok) return r
  if ('error' in r.value) return { ok: false, error: r.value.error as string }
  if ('queued' in r.value) drainSoon()
  return { ok: true }
}

/** The field asks while a video is getting ready (polled with backoff); derived from the row, so a reload agrees. */
export type VideoStatus = { kind: 'removed' | 'failed' | 'uploading' | 'preparing' | 'playable'; tooLong: boolean; durationMs: number | null; poster: string | null }
export async function videoStatusAction(input: unknown): Promise<R<{ status: VideoStatus | null }>> {
  const p = z.object({ id: z.uuid() }).safeParse(input)
  if (!p.success) return { ok: false, error: 'Unknown video.' }
  const auth = await requireMember(CAN_BUILD)
  if (!auth.ok) return { ok: false, error: auth.message }
  const s = await videoStatusFor(auth.membership.tenantId, p.data.id, new Date())
  if (!s) return { ok: true, status: null }
  return { ok: true, status: {
    kind: s.kind, tooLong: s.kind === 'failed' && s.why === 'too_long', durationMs: s.durationMs,
    // Mux's still of the loop, for the field (never the shop: the shop's first paint is the section's own photo).
    poster: s.kind === 'playable' ? `${MUX_IMAGE_BASE}/${s.playbackId}/thumbnail.webp?width=480&time=1` : null,
  } }
}
