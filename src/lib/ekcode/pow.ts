import 'server-only'
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { leadingZeroBits } from '@/domains/ekcode-core/limits'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { networkKeys, sameToken } from './keys'

// =============================================================================
// FILE: src/lib/ekcode/pow.ts — A SMALL PROOF OF WORK INSTEAD OF A CHALLENGE VENDOR (security review H4; owner call 3).
// The server hands out {nonce, bits, exp, sig}, sig binding it to the network and the flow; the browser finds a
// counter so that sha256(nonce|counter) starts with `bits` zero bits (a Web Worker, ~1–15 s at 16–24 bits); the
// server checks it once (the nonce is single-use, failing closed). It slows abuse; the global cap is the backstop.
// =============================================================================

export type PowChallenge = { nonce: string; bits: number; exp: number; sig: string }
export type PowAnswer = PowChallenge & { counter: number }

const sign = (c: Omit<PowChallenge, 'sig'>, net: string, flow: string) =>
  createHmac('sha256', networkKeys('pow').write).update(`${c.nonce}|${c.bits}|${c.exp}|${net}|${flow}`).digest('base64url')

export function powChallenge(bits: number, net: string, flowDigest: string, now = Date.now()): PowChallenge {
  const c = { nonce: randomBytes(16).toString('base64url'), bits: Math.min(24, Math.max(0, Math.floor(bits))), exp: now + 5 * 60_000 }
  return { ...c, sig: sign(c, net, flowDigest) }
}

/** The bits an answer proves (0 when it proves nothing). The nonce counts once. */
export async function powSolved(a: PowAnswer | null | undefined, net: string, flowDigest: string, now = Date.now()): Promise<number> {
  if (!a || typeof a.nonce !== 'string' || !Number.isInteger(a.counter) || a.counter < 0 || a.exp < now || a.bits > 24) return 0
  if (!sameToken(a.sig, sign({ nonce: a.nonce, bits: a.bits, exp: a.exp }, net, flowDigest))) return 0
  const h = createHash('sha256').update(`${a.nonce}|${a.counter}`).digest()
  if (leadingZeroBits(h) < a.bits) return 0
  return (await withinLimit(LIMITS.ekPowNonce, a.nonce, new Date(now), true)) ? a.bits : 0
}
