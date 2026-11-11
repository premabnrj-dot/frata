import { appIcon } from '@/components/brand/app-icon'

// Cost guardrails G·1 (scripts/check-duration.mjs): a route stops at its limit, never Vercel's 300 s.
export const maxDuration = 30

export const dynamic = 'force-static'
/** The platform's browser-tab icon (64 px; browsers scale it down). */
export function GET() { return appIcon(64) }
