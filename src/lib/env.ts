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
/** The analytics database (A·2, its own Supabase project), as frata_app: the visit beacon's inserts and the console's
 *  Traffic reads. Production only. Unset, shops count no visits and Traffic says it isn't connected. */
export const ANALYTICS_DATABASE_URL = process.env.ANALYTICS_DATABASE_URL ?? ''
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
/** EkCode (ADR-0009, P1): its own WhatsApp number and Meta app (in EkCode's own portfolio, ADR-0010), and two key rings
 *  ("id:secret,id:secret", newest first; rotate by putting a new entry in front — never by replacing one). All of
 *  them set (and NEXT_PUBLIC_EKCODE_HOST) = EkCode can be switched on; any unset = the button never shows. */
export const EKCODE_WA_PHONE_NUMBER_ID = process.env.EKCODE_WA_PHONE_NUMBER_ID ?? ''
export const EKCODE_WA_TOKEN = process.env.EKCODE_WA_TOKEN ?? ''
export const EKCODE_WA_AUTH_TEMPLATE = process.env.EKCODE_WA_AUTH_TEMPLATE ?? ''
export const EKCODE_WA_TEMPLATE_LANG = process.env.EKCODE_WA_TEMPLATE_LANG || 'en'
export const EKCODE_WA_VERIFY_TOKEN = process.env.EKCODE_WA_VERIFY_TOKEN ?? ''
export const EKCODE_META_APP_SECRET = process.env.EKCODE_META_APP_SECRET ?? ''
export const EKCODE_PHONE_PEPPERS = process.env.EKCODE_PHONE_PEPPERS ?? ''
export const EKCODE_SEAL_KEYS = process.env.EKCODE_SEAL_KEYS ?? ''

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
export const isAnalyticsConfigured = () => ANALYTICS_DATABASE_URL !== ''
/** frata-blob's id (store_…): pins which Blob host a photo may come from. Set by connecting the store. */
export const BLOB_STORE_ID = process.env.BLOB_STORE_ID ?? ''
export const isBlobConfigured = () => BLOB_READ_WRITE_TOKEN !== '' && BLOB_STORE_ID !== ''
export const isPaymentsConfigured = () => PAYMENT_KEYS_SECRET !== ''
/** Tokens are sealed with PAYMENT_KEYS_SECRET's key family, so Messages needs it too. */
export const isMessagesConfigured = () => META_APP_SECRET !== '' && PAYMENT_KEYS_SECRET !== ''

/** Test only: the e2e stack (e2e/stack.mjs) sets 1 so /console/fixtures/ui answers. Never set in Vercel. */
export const E2E_FIXTURES = process.env.E2E_FIXTURES === '1'

/** GST filing from Frrata (GST app G2): which GSP carries the calls. Unset = filing is off (the GST page offers the files
 *  for the CA only). "fake" = the in-process stand-in (src/lib/gst/gsp.ts), refused in Production. No real GSP is
 *  wired until one is contracted and counsel has opined on the ECO question (plan 2026-11-09 § 5b). */
export const GSP_PROVIDER = process.env.GSP_PROVIDER ?? ''
export const VERCEL_ENV = process.env.VERCEL_ENV ?? ''

// ── Own domains (shop addresses D2·4, D2·5) ──
/** Vercel's API token (Production only, Sensitive) and the project it manages domains on. Unset: own domains are off. */
export const VERCEL_API_TOKEN = process.env.VERCEL_API_TOKEN ?? ''
export const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID ?? ''
export const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID ?? ''
/** A local fake for e2e only: honoured off Vercel and only on 127.0.0.1 (src/lib/connectors/vercel). */
export const VERCEL_API_BASE = process.env.VERCEL_API_BASE ?? ''
/** Admin › Infrastructure (plan 2026-11-11 I·1): a TEAM token minted by the team's Billing-role member (or a Developer),
 *  Production only, Sensitive, 90-day expiry. It reads /v1/billing/charges; the puller refuses it if it can read the
 *  project's env (security review HIGH-1). Never the domains token above. Unset: the Vercel tab says what connects it. */
export const VERCEL_BILLING_TOKEN = process.env.VERCEL_BILLING_TOKEN ?? ''
export const isVercelBillingConfigured = () => VERCEL_BILLING_TOKEN !== '' && VERCEL_TEAM_ID !== '' && VERCEL_PROJECT_ID !== ''
/** DNS-over-HTTPS fakes for e2e (both resolvers, same rule): honoured off Vercel and only on 127.0.0.1. */
export const DOH_BASE = process.env.DOH_BASE ?? ''
/** How many hosts the Vercel project may hold (Hobby 50, Pro 100,000 soft): claims stop 4 below it. */
export const DOMAIN_CAPACITY = Number(process.env.DOMAIN_CAPACITY || 50)
export const isOwnDomainsConfigured = () => VERCEL_API_TOKEN !== '' && VERCEL_PROJECT_ID !== ''
/** Mux video (V1, docs/plans/2026-11-09-video-v1.md): Production only (never Preview while previews share the
 *  database). The token pair is Basic auth; the webhook secret signs Mux's events, the PREVIOUS one is accepted while
 *  a new webhook replaces the old (rotation = recreate). MUX_ENVIRONMENT_ID is the environment the token belongs to
 *  (not a secret): every video row records it, and an event from another environment is refused. */
export const MUX_TOKEN_ID = process.env.MUX_TOKEN_ID ?? ''
export const MUX_TOKEN_SECRET = process.env.MUX_TOKEN_SECRET ?? ''
export const MUX_WEBHOOK_SECRET = process.env.MUX_WEBHOOK_SECRET ?? ''
export const MUX_WEBHOOK_SECRET_PREVIOUS = process.env.MUX_WEBHOOK_SECRET_PREVIOUS ?? ''
export const MUX_ENVIRONMENT_ID = process.env.MUX_ENVIRONMENT_ID ?? ''
/** e2e only (the fake Mux): in Production only Mux's own hosts are used, whatever these say (security review L6). */
export const MUX_API_BASE = VERCEL_ENV === 'production' ? 'https://api.mux.com' : process.env.MUX_API_BASE || 'https://api.mux.com'
export const MUX_STREAM_BASE = VERCEL_ENV === 'production' ? 'https://stream.mux.com' : process.env.MUX_STREAM_BASE || 'https://stream.mux.com'
export const MUX_IMAGE_BASE = VERCEL_ENV === 'production' ? 'https://image.mux.com' : process.env.MUX_IMAGE_BASE || 'https://image.mux.com'
/** Admin › Infrastructure (plan 2026-11-11 I·1): an optional separate READ-ONLY Mux token (Video Read only) for delivery
 *  usage. Unset, the video token above is used for this GET (owner 2026-11-11: both live in the same Vercel env, so a
 *  second token would add no separation). Neither set: the Mux tab says what connects it. */
export const MUX_READ_TOKEN_ID = process.env.MUX_READ_TOKEN_ID ?? ''
export const MUX_READ_TOKEN_SECRET = process.env.MUX_READ_TOKEN_SECRET ?? ''
export const muxUsageToken = () => MUX_READ_TOKEN_ID && MUX_READ_TOKEN_SECRET ? { id: MUX_READ_TOKEN_ID, secret: MUX_READ_TOKEN_SECRET } : MUX_TOKEN_ID && MUX_TOKEN_SECRET ? { id: MUX_TOKEN_ID, secret: MUX_TOKEN_SECRET } : null
export const isMuxUsageConfigured = () => muxUsageToken() !== null
export const isVideoConfigured = () => MUX_TOKEN_ID !== '' && MUX_TOKEN_SECRET !== '' && MUX_WEBHOOK_SECRET !== '' && /^[A-Za-z0-9_-]{1,40}$/.test(MUX_ENVIRONMENT_ID)
