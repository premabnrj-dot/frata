'use server'

import { z } from 'zod'
import { LINE_MAX } from '@/lib/db/schema-studio'
import { requireStudio } from '@/lib/studio/with-studio'
import { send, stop, type SendWhy } from '@/lib/studio/sessions'
import { applyProposal, dismissProposal, type ApplyResult } from '@/lib/studio/apply'

// =============================================================================
// FILE: src/app/(partner)/partner/studio/actions.ts — STUDIO'S SEND AND STOP (plan docs/plans/2026-11-22-v3a-runtime.md
// § The first test step 2; R6). Each starts with requireStudio() (check:studio): the store, the person and their
// partner come from the session, never from the form. A turn id never comes from here either: the advance reads it
// from the person's own open session. The refusal codes are drawn by the chat (R7, states 1–6).
// =============================================================================

// `store`: the store this tab was opened for. Never the source of the store (that is requireStudio's); a different one
// means the person switched stores in another tab, so this tab reloads instead of sending to the other store.
const SendInput = z.strictObject({ text: z.string().trim().min(1).max(LINE_MAX), store: z.uuid() })
const StopInput = z.strictObject({ store: z.uuid() })

export async function sendAction(input: unknown): Promise<{ ok: true } | { ok: false; why: SendWhy | 'input' | 'moved' }> {
  const auth = await requireStudio()
  if (!auth.ok) return { ok: false, why: 'closed' }
  const p = SendInput.safeParse(input)
  if (!p.success) return { ok: false, why: 'input' }
  if (p.data.store !== auth.tenantId) return { ok: false, why: 'moved' }
  const r = await send(auth, p.data.text)
  return r.ok ? { ok: true } : { ok: false, why: r.why }
}

const ApplyInput = z.strictObject({ id: z.uuid(), version: z.number().int().positive().nullable() })
const DismissInput = z.strictObject({ id: z.uuid() })

/** Apply a card: the proposal is read on the person's own session (never by an id alone); `version` is the brand record
 *  the person holds, so a brand changed since is refused (state 9). */
export async function applyAction(input: unknown): Promise<ApplyResult> {
  const auth = await requireStudio()
  if (!auth.ok) return { ok: false, error: auth.message }
  const p = ApplyInput.safeParse(input)
  if (!p.success) return { ok: false, error: 'That didn’t go through. Try again.' }
  return applyProposal(auth, p.data.id, p.data.version)
}

export async function dismissAction(input: unknown): Promise<{ ok: boolean }> {
  const auth = await requireStudio()
  if (!auth.ok) return { ok: false }
  const p = DismissInput.safeParse(input)
  if (!p.success) return { ok: false }
  return dismissProposal(auth, p.data.id)
}

export async function stopAction(input: unknown): Promise<{ ok: boolean; moved?: true }> {
  const auth = await requireStudio()
  if (!auth.ok) return { ok: false }
  const p = StopInput.safeParse(input)
  if (!p.success) return { ok: false }
  if (p.data.store !== auth.tenantId) return { ok: false, moved: true }
  return stop(auth)
}
