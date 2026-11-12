// =============================================================================
// FILE: src/domains/infra/stage.ts
//
// WHERE SECRETS MAY BE READ (previews off production, spec 2026-11-12). On Vercel, only the Production deployment
// reads a secret: a preview, a custom environment or a missing VERCEL_ENV reads every secret as unset, so a variable
// added to Preview by mistake still does nothing. Off Vercel (local development, the e2e stack, CI, int tests) the
// process's own variables are read as given. This catches mistakes, not attackers: branch code could delete it. The
// boundary is Vercel's variable scoping, the rotated tokens and staff passkeys.
// =============================================================================

/** `vercel`: process.env.VERCEL ('1' on Vercel); `stage`: process.env.VERCEL_ENV. 'development' is only ever a person's
 *  own machine (`vercel dev`, or `vercel env pull`, which writes VERCEL=1 and VERCEL_ENV=development); no Vercel
 *  deployment runs as it, and Development holds no production secret. */
export const secretsAllowed = (vercel: string | undefined, stage: string | undefined): boolean => vercel !== '1' || stage === 'production' || stage === 'development'

/** Sign-in in the browser: NEXT_PUBLIC_VERCEL_ENV is set per environment at build ('' off Vercel, or when the project
 *  does not expose system variables). Off on a preview or a custom environment. */
export const signInAllowedIn = (publicStage: string | undefined): boolean => !publicStage || publicStage === 'production' || publicStage === 'development'
