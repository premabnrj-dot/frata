// Relative, not '@/': next.config loads this file, and its loader does not resolve the alias.
import { platformHost } from '../domains/tenancy/host'
import { secretsAllowed, signInAllowedIn } from '../domains/infra/stage'
// =============================================================================
// FILE: src/lib/public-env.ts
//
// PUBLIC values, inlined into browser code at build. Nothing secret may ever
// be added here: a NEXT_PUBLIC_ name is shipped to every visitor.
// =============================================================================

/** Sign-in is off outside Production on Vercel (previews off production, spec 2026-11-12): the server reads VERCEL and
 *  VERCEL_ENV at runtime; the browser reads NEXT_PUBLIC_VERCEL_ENV, set per environment at build. */
const SIGN_IN_ALLOWED = typeof window === 'undefined'
  ? secretsAllowed(process.env.VERCEL, process.env.VERCEL_ENV)
  : signInAllowedIn(process.env.NEXT_PUBLIC_VERCEL_ENV)
export const SUPABASE_URL = SIGN_IN_ALLOWED ? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '' : ''
export const SUPABASE_ANON_KEY = SIGN_IN_ALLOWED ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '' : ''
export const CONSOLE_HOST = process.env.NEXT_PUBLIC_CONSOLE_HOST ?? 'app.frata.in'

/** The domain a shop's subdomain sits under: <slug>.<SHOP_DOMAIN>. Production: frrata.shop (live 2026-11-08; its bare domain redirects). */
export const SHOP_DOMAIN = process.env.NEXT_PUBLIC_SHOP_DOMAIN || 'frata.store'

/** A shop's platform address, `kesar-studio.frrata.shop` (built by the one pure rule in tenancy/host.ts). */
export const shopHost = (slug: string) => platformHost(slug, SHOP_DOMAIN)

/** Frrata's Meta app id and its Embedded Signup configuration: both are shown to Meta's popup in the browser (not secret). */
export const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID ?? ''
export const WA_CONFIG_ID = process.env.NEXT_PUBLIC_WA_CONFIG_ID ?? ''
export const isWhatsAppSignupConfigured = () => META_APP_ID !== '' && WA_CONFIG_ID !== ''

/** EkCode's own host (ekcode.in). Empty = EkCode's pages are not served anywhere (src/domains/tenancy/host.ts). */
export const EKCODE_HOST = (process.env.NEXT_PUBLIC_EKCODE_HOST ?? '').toLowerCase()

export const isAuthConfigured = () => SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== ''
