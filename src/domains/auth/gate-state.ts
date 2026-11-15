// =============================================================================
// FILE: src/domains/auth/gate-state.ts — what a passkey gate needs to know, for staff and partner people alike
// (app_staff_state, app_partner_pk_state). Read by the server (the stores) and the gates (impact review: one type, not
// a server import from components). `opensAt`: a partner owner's recovery can be approved only from then (24 hours).
// =============================================================================

export type GateState = {
  passkeys: number
  request: { expiresAt: string; approved: boolean; approvedUntil: string; approvedBy: string | null; opensAt?: string | null } | null
}

/** The partner gate's state (app_partner_pk_state): the person's role, and whether the owner declined the request. */
export type PartnerGate = GateState & { role: 'owner' | 'lead'; request: (NonNullable<GateState['request']> & { declined?: boolean }) | null }
