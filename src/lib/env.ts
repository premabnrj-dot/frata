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
/** Encrypts each shop's Razorpay secrets and signs order links (src/lib/crypto/secret-box.ts). Production only.
 *  Changing it makes saved Razorpay secrets unreadable: those shops must reconnect. */
export const PAYMENT_KEYS_SECRET = process.env.PAYMENT_KEYS_SECRET ?? ''
/** Razorpay's API base. Unset in Vercel (the real API); set only by the local end-to-end test to its stand-in. */
export const RAZORPAY_API_BASE = process.env.RAZORPAY_API_BASE || 'https://api.razorpay.com'
/** Vercel Blob store frata-blob (ADR-0005): product photos and logos. Set by connecting the store in Vercel. */
export const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN ?? ''

/** Messages (WhatsApp, docs/specs/2026-11-07-communication.md). Frrata's Meta app secret: signs every webhook and
 *  exchanges a merchant's signup code. Production only. */
export const META_APP_SECRET = process.env.META_APP_SECRET ?? ''
/** The string Meta echoes back when the webhook URL is added in the app dashboard. Any random value. */
export const WA_VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN ?? ''
/** Graph API base. Unset in Vercel (the real one); set only by the local end-to-end test to its stand-in. */
export const META_GRAPH_BASE = process.env.META_GRAPH_BASE || 'https://graph.facebook.com'

/** False on a fresh Vercel project with no variables yet: pages say so instead of crashing. */
export const isDatabaseConfigured = () => DATABASE_URL !== ''
export const isAdminDatabaseConfigured = () => ADMIN_DATABASE_URL !== ''
/** frata-blob's id (store_…): pins which Blob host a photo may come from. Set by connecting the store. */
export const BLOB_STORE_ID = process.env.BLOB_STORE_ID ?? ''
export const isBlobConfigured = () => BLOB_READ_WRITE_TOKEN !== '' && BLOB_STORE_ID !== ''
export const isPaymentsConfigured = () => PAYMENT_KEYS_SECRET !== ''
/** Tokens are sealed with PAYMENT_KEYS_SECRET's key family, so Messages needs it too. */
export const isMessagesConfigured = () => META_APP_SECRET !== '' && PAYMENT_KEYS_SECRET !== ''

/** Test only: the e2e stack (e2e/stack.mjs) sets 1 so /console/fixtures/ui answers. Never set in Vercel. */
export const E2E_FIXTURES = process.env.E2E_FIXTURES === '1'
