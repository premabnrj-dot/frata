// =============================================================================
// FILE: src/domains/email/staff-security.ts — the words of a staff security email (staff passkeys spec § Design 5):
// someone added or removed from Frrata staff, a passkey request approved, a passkey added or removed. Sent to the
// person concerned and to every admin, so a change nobody expected is seen at once.
// =============================================================================

export type StaffNoticeKind = 'staff_added' | 'staff_removed' | 'request_approved' | 'passkey_added' | 'passkey_removed'
  | 'partner_passkey_added' | 'partner_passkey_removed' | 'partner_request_made' | 'partner_request_approved'
  | 'partner_role_changed' | 'passkeys_off' | 'passkeys_on'
  /** Settings › People (drizzle/0174): to the person invited to a store (`about` the store, `detail` the role) and to a
   *  partner owner a store asked (`about` the store). The store's name is the merchant's text: plain, capped at 60. */
  | 'store_invite' | 'store_partner_invite'
/** The partner side's kinds (T1b, drizzle/0129): sent to the person and the partner's owner (an owner's own recovery:
 *  every Frrata admin too). The email's button opens the workspace, not Admin. */
export const isPartnerNotice = (k: StaffNoticeKind) => k.startsWith('partner_') || k === 'store_partner_invite'
/** A store's invitation to a person: the button opens the console's sign-in. */
export const isStoreInvite = (k: StaffNoticeKind) => k === 'store_invite'
const GIVEN_LABEL: Record<string, string> = { admin: 'Manager', staff: 'Staff', accountant: 'Accountant' }

export function staffSecurityWords(n: { kind: StaffNoticeKind; about: string; by: string | null; detail: string | null }): { subject: string; body: string } {
  const by = n.by ?? 'Frrata'
  const key = n.detail ? ` "${n.detail.slice(0, 40)}"` : ''
  switch (n.kind) {
    case 'staff_added': return { subject: `${n.about} was added to Frrata staff`, body: `${by} added ${n.about} to Frrata staff.` }
    case 'staff_removed': return { subject: `${n.about} was removed from Frrata staff`, body: `${by} removed ${n.about} from Frrata staff. Their passkeys and any open support visit have ended.` }
    case 'request_approved': return { subject: `A new passkey was approved for ${n.about}`, body: `${by} approved a request from ${n.about} to add a passkey. It can be used for 10 minutes, on the browser that asked.` }
    case 'passkey_added': return { subject: `${n.about} added a passkey`, body: `${n.about} added the passkey${key} to their Frrata staff account.` }
    case 'passkey_removed': return { subject: `A passkey was removed from ${n.about}`, body: `${by} removed the passkey${key} from ${n.about}.` }
    case 'partner_passkey_added': return { subject: `${n.about} added a passkey`, body: `${n.about} added the passkey${key} to their Frrata partner sign-in.` }
    case 'partner_passkey_removed': return { subject: `A passkey was deleted for ${n.about}`, body: n.detail === 'every passkey'
      ? `${by} deleted every passkey of ${n.about}. They’re signed out on every device.` : `${n.about} deleted the passkey${key} from their Frrata partner sign-in.` }
    case 'partner_request_made': return n.detail === 'first'
      ? { subject: `${n.about} asked Frrata for a first passkey`, body: `${n.about} asked Frrata to approve their first passkey. We'll call the phone on their record.` }
      : { subject: `${n.about} asked Frrata for a new passkey`, body: `${n.about} can't use their passkey. We'll call the phone on their record. We can approve a new one after 24 hours.` }
    // T1c: the detail is the new role's word (Lead or Builder).
    case 'partner_role_changed': return { subject: `${n.about} is now a ${n.detail ?? 'new role'}`, body: `${by} made ${n.about} a ${n.detail ?? 'new role'}. Their stores stay the same.` }
    // Passkeys off or on for everyone from Admin › Staff (drizzle/0171); `about` is the master admin who did it.
    case 'passkeys_off': return { subject: 'Passkeys are off for all staff and partners', body: `${n.about} turned passkeys off. Staff and partners now sign in with an email code alone.` }
    case 'passkeys_on': return { subject: 'Passkeys are on for all staff and partners', body: `${n.about} turned passkeys on. Staff and partners confirm with a passkey again.` }
    case 'store_invite': return { subject: `${n.by ?? 'The owner'} added you to ${n.about}`, body: `Sign in to join as ${GIVEN_LABEL[n.detail ?? ''] ?? 'a member'}. This invitation expires in 14 days.` }
    case 'store_partner_invite': return { subject: `${n.about} wants you as its partner`, body: `${n.by ?? 'The owner'} sent this invitation. It expires in 14 days.` }
    case 'partner_request_approved': return { subject: `A new passkey was approved for ${n.about}`, body: `${by} approved a new passkey for ${n.about}. ${n.about} can create it on the same device within 10 minutes.` }
  }
}
