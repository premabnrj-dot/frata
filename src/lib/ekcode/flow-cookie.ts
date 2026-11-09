import 'server-only'
import { cookies } from 'next/headers'
import { cookieName, cookieSecure } from './cookie-name'
import { ekOpen, ekSeal } from './keys'

// =============================================================================
// FILE: src/lib/ekcode/flow-cookie.ts — EKCODE.IN'S ONE COOKIE (P1 task 6; security M1). `__Host-ek_flow`: HttpOnly,
// Secure, SameSite=Strict, 15 minutes, sealed whole. It holds the flow handle, the current code's id, the proof once
// the code is right, and the number typed — so no request body can name a flow, a code or a proof.
// =============================================================================

const EK_FLOW_COOKIE = () => cookieName('ek_flow')
export type FlowCookie = { h: string; c?: string; p?: string; m?: string }
const AAD = 'ekcode.in:flow-cookie:v1'

export async function readFlow(): Promise<FlowCookie | null> {
  const raw = (await cookies()).get(EK_FLOW_COOKIE())?.value
  if (!raw) return null
  const plain = ekOpen(raw, AAD)
  if (!plain) return null
  try {
    const v = JSON.parse(plain) as FlowCookie
    return typeof v.h === 'string' && /^[A-Za-z0-9_-]{22,43}$/.test(v.h) ? v : null
  } catch { return null }
}

export async function writeFlow(v: FlowCookie) {
  ;(await cookies()).set(EK_FLOW_COOKIE(), ekSeal(JSON.stringify(v), AAD), { httpOnly: true, secure: cookieSecure(), sameSite: 'strict', path: '/', maxAge: 15 * 60 })
}

export async function clearFlow() {
  ;(await cookies()).set(EK_FLOW_COOKIE(), '', { httpOnly: true, secure: cookieSecure(), sameSite: 'strict', path: '/', maxAge: 0 })
}
