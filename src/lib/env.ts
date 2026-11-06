import 'server-only'

// =============================================================================
// FILE: src/lib/env.ts
//
// THE ONE PLACE a server secret is read. `scripts/check-config.mjs` fails any
// other `process.env.X` outside its owner module, and any name missing from
// .env.example. Public values (NEXT_PUBLIC_*) live in src/lib/public-env.ts.
// =============================================================================

export const DATABASE_URL = process.env.DATABASE_URL ?? ''
/** frata_admin — cross-tenant (ADR-0007). Set for Production only; previews say "not connected". */
export const ADMIN_DATABASE_URL = process.env.ADMIN_DATABASE_URL ?? ''
export const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? ''
/** Vercel Blob store frata-blob (ADR-0005): product photos and logos. Set by connecting the store in Vercel. */
export const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN ?? ''

/** False on a fresh Vercel project with no variables yet: pages say so instead of crashing. */
export const isDatabaseConfigured = () => DATABASE_URL !== ''
export const isAdminDatabaseConfigured = () => ADMIN_DATABASE_URL !== ''
export const isBlobConfigured = () => BLOB_READ_WRITE_TOKEN !== ''
