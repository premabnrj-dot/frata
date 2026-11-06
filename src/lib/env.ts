import 'server-only'

// =============================================================================
// FILE: src/lib/env.ts
//
// THE ONE PLACE a server secret is read. `scripts/check-config.mjs` fails any
// other `process.env.X` outside its owner module, and any name missing from
// .env.example. Public values (NEXT_PUBLIC_*) live in src/lib/public-env.ts.
// =============================================================================

export const DATABASE_URL = process.env.DATABASE_URL ?? ''
export const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? ''

/** False on a fresh Vercel project with no variables yet: pages say so instead of crashing. */
export const isDatabaseConfigured = () => DATABASE_URL !== ''
