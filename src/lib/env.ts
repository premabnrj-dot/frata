import 'server-only'

// =============================================================================
// FILE: src/lib/env.ts
//
// THE ONE PLACE a server secret is read. `scripts/check-config.mjs` fails any
// other `process.env.X` outside its owner module, and any name missing from
// .env.example. Public values (NEXT_PUBLIC_*) live in src/lib/public-env.ts.
// =============================================================================

export const DATABASE_URL = process.env.DATABASE_URL ?? ''
/** Trials (TR1): the key of the one-trial-per-business HMACs (src/lib/trials/claims.ts). Production only. Without it a
 *  sign-up gets no trial (fail closed). Never change it once set: earlier claims would no longer match (bump
 *  TRIAL_CLAIM_KEY_VERSION with a new key instead). */
export const TRIAL_CLAIM_SECRET = process.env.TRIAL_CLAIM_SECRET ?? ''
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
/** Frrata's OWN WhatsApp number (not a merchant's) for sign-up codes (trials TR1; frata-integrations § Sign-up code).
 *  These three and TRIAL_CLAIM_SECRET set = the WhatsApp code step is on at /start; any unset = off (sign-up uses the verified email only). */
export const FRRATA_WA_PHONE_NUMBER_ID = process.env.FRRATA_WA_PHONE_NUMBER_ID ?? ''
export const FRRATA_WA_TOKEN = process.env.FRRATA_WA_TOKEN ?? ''
/** The approved copy-code authentication template's name and language. */
export const FRRATA_WA_SIGNUP_TEMPLATE = process.env.FRRATA_WA_SIGNUP_TEMPLATE ?? ''
export const FRRATA_WA_TEMPLATE_LANG = process.env.FRRATA_WA_TEMPLATE_LANG || 'en'

/** Frrata as the supplier on its own invoices (billing B2). FRRATA_GSTIN unset = test mode: invoices go out in a TEST
 *  series, printed "not a tax invoice". All four are set together, with the CA, before real billing. */
export const FRRATA_GSTIN = process.env.FRRATA_GSTIN ?? ''
export const FRRATA_LEGAL_NAME = process.env.FRRATA_LEGAL_NAME ?? ''
export const FRRATA_ADDRESS = process.env.FRRATA_ADDRESS ?? ''
export const FRRATA_SAC = process.env.FRRATA_SAC ?? ''
/** Test databases only (e2e, int tests): lets Admin issue a month in test mode. NEVER in Production or a preview on
 *  the production database: a test-mode issue freezes the real drafts and their orders' fees for good. */
export const BILLING_TEST_ISSUE = process.env.BILLING_TEST_ISSUE ?? ''

/** Frrata's OWN Razorpay account, for billing merchants (billing B3; plan finding 15): Production only, Sensitive, read
 *  only by src/lib/billing/gateway.ts. Never a shop's keys. The webhook secret has a previous value during a rotation. */
export const RAZORPAY_BILLING_KEY_ID = process.env.RAZORPAY_BILLING_KEY_ID ?? ''
export const RAZORPAY_BILLING_KEY_SECRET = process.env.RAZORPAY_BILLING_KEY_SECRET ?? ''
export const RAZORPAY_BILLING_WEBHOOK_SECRET = process.env.RAZORPAY_BILLING_WEBHOOK_SECRET ?? ''
export const RAZORPAY_BILLING_WEBHOOK_SECRET_PREVIOUS = process.env.RAZORPAY_BILLING_WEBHOOK_SECRET_PREVIOUS ?? ''

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
