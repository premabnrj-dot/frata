import 'server-only'
import { E2E_FIXTURES, VERCEL_ENV } from '@/lib/env'

// One rule for EkCode's cookies (P1): `__Host-` and Secure everywhere, except the local e2e stack, which serves its
// hosts over plain http (Chromium drops a Secure or __Host- cookie there). Never off in production or a preview.
const insecure = () => VERCEL_ENV === '' && (E2E_FIXTURES || process.env.NODE_ENV === 'development')
export const cookieName = (base: string) => (insecure() ? base : `__Host-${base}`)
export const cookieSecure = () => !insecure()
/** The scheme EkCode's redirects use: https, except the local e2e stack (plain http, hosts mapped to the app). */
export const scheme = () => (insecure() ? 'http' : 'https')
