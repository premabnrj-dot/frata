// Addresses, people and test keys shared by the flows (e2e/lib.mjs) and the fakes (e2e/fakes/*): no imports, so a fake starts without Playwright.
export const PORTS = { app: 3077, razorpay: 4010, auth: 54399, pg: 54340, meta: 4020 }
/** Frrata's Meta app in the local test: a stand-in Graph API (e2e/fakes/meta.mjs) knows these. */
export const META = { appId: '1234567890', appSecret: 'e2e-meta-app-secret', configId: '9876543210', verifyToken: 'e2e-verify-token' }
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
}
export const RZP_KEYS = { id: 'rzp_live_FrataTest01', secret: 'testsecret12345678abcd' }

