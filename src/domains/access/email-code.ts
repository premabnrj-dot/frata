// =============================================================================
// FILE: src/domains/access/email-code.ts
//
// THE EMAILED 6-DIGIT CODE, AS EVERY PAGE THAT ASKS FOR IT AGREES (O1·8b): how long until it may be sent again, and
// what the page does once `verifyCode` says where the person goes (routeAfterSignIn, beside this file). Pure.
// =============================================================================

/** Supabase refuses a second email to one address within a minute. */
export const RESEND_SECONDS = 60

/** Whole seconds until "Send again"; 0 when nothing was sent or the minute has passed. */
export function resendWait(sentAt: number | null, now: number): number {
  return sentAt === null ? 0 : Math.max(0, RESEND_SECONDS - Math.floor((now - sentAt) / 1000))
}

/**
 * `stay`: sign-up keeps its page and answers (a person with no store yet goes on to the next question). `assign`: the
 * partner workspace and a team invite ask for a passkey this page's policy refuses, so a full page load gives them their
 * own. `replace`: anywhere else, a client move.
 */
export function afterVerify(to: string): 'stay' | 'assign' | 'replace' {
  if (to === '/start') return 'stay'
  if (to === '/partner' || to === '/join') return 'assign'
  return 'replace'
}
