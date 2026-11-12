import { createHash, timingSafeEqual } from 'node:crypto'
import { SECRETS_ALLOWED } from '@/lib/env'

// =============================================================================
// FILE: lib/auth/cron.ts
//
// IS THIS VERCEL CRON? Vercel sends `Authorization: Bearer <CRON_SECRET>`
// (vercel.json). Every cron route asks here. A plain `!==` returns as soon as a
// character differs and so leaks, in time, how much of a guess was right.
//
// Both sides are hashed first so the comparison is of equal lengths whatever
// was sent. Without a secret configured, nothing is Vercel Cron.
// =============================================================================

const digest = (s: string) => createHash('sha256').update(s).digest()

/** The request's own check: reads CRON_SECRET here, so no route reads it. */
export function isCronRequest(request: Request): boolean {
  // A secret, so Production only on Vercel (previews off production, 2026-11-12; src/lib/env.ts).
  return isCronCall(request.headers.get('authorization'), SECRETS_ALLOWED ? process.env.CRON_SECRET : undefined)
}

export function isCronCall(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization) return false
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`))
}
