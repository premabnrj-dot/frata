// =============================================================================
// FILE: src/lib/public-env.ts
//
// PUBLIC values, inlined into browser code at build. Nothing secret may ever
// be added here: a NEXT_PUBLIC_ name is shipped to every visitor.
// =============================================================================

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
export const CONSOLE_HOST = process.env.NEXT_PUBLIC_CONSOLE_HOST ?? 'app.frata.in'

export const isAuthConfigured = () => SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== ''
