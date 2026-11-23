import { NextResponse } from 'next/server'
import { isCronRequest } from '@/lib/auth/cron'
import { isStudioConfigured } from '@/lib/env'
import { runStudioCron } from '@/lib/studio/sessions'

// ENTRY POINT credential: CRON_SECRET via isCronRequest (scripts/check-actions.mjs).
// Studio's per-minute net (plan docs/plans/2026-11-22-v3a-runtime.md § Advance, § Session end): ids only from
// app_studio_due; each open turn advanced, sessions ended (switch, a gone person, 23 hours, an idle hour), ended ones
// cleaned up, those 30 days past their end deleted at Anthropic. Every runtime call deadlined; no transaction held
// across one.

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isCronRequest(request)) return new NextResponse(null, { status: 401 })
  // Without the key nothing at Anthropic can be read or cleaned, but the database half still runs: open sessions end
  // as `switch` and their build keys are revoked (security review of R6, MED-2).
  return NextResponse.json(await runStudioCron(Date.now() + 50_000, undefined, undefined, isStudioConfigured()))
}
