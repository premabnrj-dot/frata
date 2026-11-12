// =============================================================================
// FILE: src/components/passkeys/types.ts — what the passkey gate needs to know, for staff and partner people alike
// (app_staff_state, app_partner_pk_state). `opensAt`: a partner owner's recovery request can be approved only from
// then (24 hours after it was made, when they already have a passkey; T1b review H2).
// =============================================================================

export type GateState = {
  passkeys: number
  request: { expiresAt: string; approved: boolean; approvedUntil: string; approvedBy: string | null; opensAt?: string | null } | null
}
