// =============================================================================
// FILE: src/lib/public-env.ts
//
// PUBLIC values, inlined into browser code at build. Nothing secret may ever
// be added here: a NEXT_PUBLIC_ name is shipped to every visitor.
// =============================================================================

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
export const CONSOLE_HOST = process.env.NEXT_PUBLIC_CONSOLE_HOST ?? 'app.frata.in'

/** The domain a shop's subdomain sits under: <slug>.<SHOP_DOMAIN>. Not yet bought (owner call). */
export const SHOP_DOMAIN = process.env.NEXT_PUBLIC_SHOP_DOMAIN || 'frata.store'

/** Frrata's Meta app id and its Embedded Signup configuration: both are shown to Meta's popup in the browser (not secret). */
export const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID ?? ''
export const WA_CONFIG_ID = process.env.NEXT_PUBLIC_WA_CONFIG_ID ?? ''
export const isWhatsAppSignupConfigured = () => META_APP_ID !== '' && WA_CONFIG_ID !== ''

export const isAuthConfigured = () => SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== ''
