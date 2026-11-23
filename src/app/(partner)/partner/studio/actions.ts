'use server'

import { z } from 'zod'
import { LINE_MAX } from '@/lib/db/schema-studio'
import { requireStudio } from '@/lib/studio/with-studio'
import { send, stop, type SendWhy } from '@/lib/studio/sessions'

// =============================================================================
// FILE: src/app/(partner)/partner/studio/actions.ts — STUDIO'S SEND AND STOP (plan docs/plans/2026-11-22-v3a-runtime.md
// § The first test step 2; R6). Each starts with requireStudio() (check:studio): the store, the person and their
// partner come from the session, never from the form. A turn id never comes from here either: the advance reads it
// from the person's own open session. The refusal codes are drawn by the chat (R7, states 1–6).
// =============================================================================

const SendInput = z.strictObject({ text: z.string().trim().min(1).max(LINE_MAX) })

export async function sendAction(input: unknown): Promise<{ ok: true } | { ok: false; why: SendWhy | 'input' }> {
  const auth = await requireStudio()
  if (!auth.ok) return { ok: false, why: 'closed' }
  const p = SendInput.safeParse(input)
  if (!p.success) return { ok: false, why: 'input' }
  const r = await send(auth, p.data.text)
  return r.ok ? { ok: true } : { ok: false, why: r.why }
}

export async function stopAction(): Promise<{ ok: boolean }> {
  const auth = await requireStudio()
  if (!auth.ok) return { ok: false }
  return stop(auth)
}
