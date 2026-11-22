'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { requirePartner } from '@/lib/auth/require-partner'
import { PasskeyResponse, passkeySite } from '@/lib/auth/webauthn'
import { clientIp } from '@/lib/http/client-ip'
import { deleteMyComputer } from '@/lib/db/device-codes'
import { checkDeviceCode, giveOptions, giveVerify, type DeviceRefusal } from '@/lib/storefront-api/device'
import type { CodeLook } from '@/lib/db/device-codes'
import { errName } from '@/lib/log'

// =============================================================================
// FILE: src/app/(partner)/partner/(workspace)/developer/actions.ts — Partner workspace › Developer (G·3; four screens
// § 2, owner-approved 2026-11-22). The person at the terminal checks their own code and gives it a key with a passkey
// made for that code. Who: requirePartner (a live partner person with this session's check), a Builder refused here for
// the words; the definers decide again (a Partner owner, or a Lead assigned to the store, of the store's own partner).
// The code travels in these actions' bodies only, never a URL. Each answer is a reason the page words, never a sentence
// from here.
// =============================================================================

export type DeviceAnswer<T> = { ok: true; value: T } | { ok: false; why: DeviceRefusal | 'builder' }
const Code = z.string().trim().max(20)

async function who() {
  const auth = await requirePartner()
  if (!auth.ok) return { ok: false as const, why: 'sign_in_again' as const }
  if (auth.partner.memberRole === 'builder') return { ok: false as const, why: 'builder' as const }
  return { ok: true as const, p: { userId: auth.userId, sessionId: auth.sessionId, stepup: auth.stepup } }
}
async function site() {
  return passkeySite((await headers()).get('host') ?? '')
}

/** Check code: the dialog's facts (store, started, network, room, a passkey) for the code typed. */
export async function checkCodeAction(typed: unknown): Promise<DeviceAnswer<CodeLook>> {
  const code = Code.safeParse(typed)
  if (!code.success) return { ok: false, why: 'bad_code' }
  const w = await who()
  if (!w.ok) return w
  const r = await checkDeviceCode(w.p, code.data, await clientIp())
  return r.ok ? { ok: true, value: r.look } : r
}

/** Give key, step 1: the options the device signs (a challenge for this code alone). */
export async function giveOptionsAction(typed: unknown): Promise<DeviceAnswer<unknown>> {
  const code = Code.safeParse(typed)
  if (!code.success) return { ok: false, why: 'bad_code' }
  const w = await who()
  if (!w.ok) return w
  const s = await site()
  if (!s) return { ok: false, why: 'not_confirmed' }
  const r = await giveOptions(w.p, code.data, s)
  return r.ok ? { ok: true, value: r.options } : r
}

/** Give key, step 2: the device's answer; the store's name when the key is given. */
export async function giveVerifyAction(typed: unknown, response: unknown): Promise<DeviceAnswer<string>> {
  const code = Code.safeParse(typed)
  const answer = PasskeyResponse.safeParse(response)
  if (!code.success) return { ok: false, why: 'bad_code' }
  if (!answer.success) return { ok: false, why: 'not_confirmed' }
  const w = await who()
  if (!w.ok) return w
  const s = await site()
  if (!s) return { ok: false, why: 'not_confirmed' }
  const r = await giveVerify(w.p, code.data, answer.data as never, s)
  return r.ok ? { ok: true, value: r.store } : r
}

/** Delete key on Your computers: the person's own developer key, at once. False: it was gone already. */
export async function deleteComputerAction(id: unknown): Promise<{ ok: boolean }> {
  const key = z.uuid().safeParse(id)
  if (!key.success) return { ok: false }
  const auth = await requirePartner()
  if (!auth.ok) return { ok: false }
  try {
    return { ok: await deleteMyComputer({ userId: auth.userId, sessionId: auth.sessionId, stepup: auth.stepup }, key.data) }
  } catch (err) {
    console.error('[developer] delete', errName(err))
    return { ok: false }
  }
}
