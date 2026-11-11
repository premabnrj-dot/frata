// Addresses, people and test keys shared by the flows (e2e/lib.mjs) and the fakes (e2e/fakes/*): no imports, so a fake starts without Playwright.
export const PORTS = { app: 3077, razorpay: 4010, auth: 54399, pg: 54340, meta: 4020, mux: 4030, domains: 4040, ses: 4050 }
/** Frrata's Mux in the local test: a stand-in API, upload host, stream and image host (e2e/fakes/mux.mjs). */
export const MUX = { tokenId: 'e2e-mux-token', tokenSecret: 'e2e-mux-secret', webhook: 'e2e-mux-webhook-secret', env: 'e2eenv', readId: 'e2e-mux-read', readSecret: 'e2e-mux-read-secret' }
/** Email in the local test (ADR-0011): the fake SES and its SNS topic (e2e/fakes/ses.mjs), test-only keys. */
export const SES = { topic: 'arn:aws:sns:ap-south-1:000000000000:frrata-e2e', key: 'AKIAE2E:e2e-ses-secret', shopDomain: 'frratamail.test', noticesFrom: 'Frrata <notices@notify.frrata.test>',
  keys: 'e1:e2e-email-key-0123456789abcdefghijklmnop', hookSecret: 'v1,whsec_' + Buffer.from('e2e-send-email-hook-secret-0123456789').toString('base64') }
/** A merchant's own domain in the local run (shop addresses D2·10): e2e/fakes/domains.mjs answers for it. */
export const OWN_DOMAIN = 'kesarstudio-e2e.in'
/** Frrata's Meta app in the local test: a stand-in Graph API (e2e/fakes/meta.mjs) knows these. */
export const META = { appId: '1234567890', appSecret: 'e2e-meta-app-secret', configId: '9876543210', verifyToken: 'e2e-verify-token' }
/** EkCode in the local test (P1): its host, its own number and app on the fake Meta, and key rings (test-only). */
// ekcode.localhost: a *.localhost host is a secure context to Chromium over http, so Web Crypto (the proof of work) runs.
export const EKCODE = { host: 'ekcode.localhost', token: 'EAAe2eekcodecodes', number: '200000000088', template: 'ekcode_signin_code', appSecret: 'e2e-ekcode-app-secret', verifyToken: 'e2e-ekcode-verify',
  peppers: 'p1:e2e-ekcode-pepper-0123456789abcdefghijk', seals: 'k1:e2e-ekcode-seal-key-0123456789abcdefghi', notOnWhatsApp: '7000000000' }
export const SHOP_DOMAIN = 'frata.test'
export const SHOP = `http://kesar-studio.${SHOP_DOMAIN}`
export const CONSOLE = `http://localhost:${PORTS.app}`
export const RZP = `http://localhost:${PORTS.razorpay}`
export const OUT = new URL('./.out/', import.meta.url).pathname
/** Access token → person. The seed holds the owner; flows add others as members. */
export const USERS = {
  owner: { id: 'cccccccc-0000-0000-0000-000000000001', email: 'riya@kesarstudio.in' },
  staff: { id: 'cccccccc-0000-0000-0000-000000000002', email: 'arjun@kesarstudio.in' },
  // Frata staff (platform_staff), for Admin and support visits. Added by the flows that need it (90-ux), not the seed.
  frata: { id: 'cccccccc-0000-0000-0000-000000000009', email: 'meera@frata.test' },
  // A partner who builds stores, and the brand owner a store is handed to (40-partners adds both).
  partner: { id: 'cccccccc-0000-0000-0000-000000000010', email: 'pia@studio.test' },
  brand: { id: 'cccccccc-0000-0000-0000-000000000011', email: 'neha@brandco.test' },
  // A brand owner signing up on their own (63-signup, trials TR1): no shop until the flow makes one.
  founder: { id: 'cccccccc-0000-0000-0000-000000000012', email: 'aanya@noorthreads.test' },
}
export const RZP_KEYS = { id: 'rzp_live_FrataTest01', secret: 'testsecret12345678abcd' }
/** Frrata's own billing account (billing B3), test keys: they may collect only test-mode invoices. */
export const BILLING_KEYS = { id: 'rzp_test_FrrataBill1', secret: 'billsecret12345678abcd', webhook: 'billwebhooksecret123' }

