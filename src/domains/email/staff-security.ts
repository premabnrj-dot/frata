// =============================================================================
// FILE: src/domains/email/staff-security.ts — the words of a staff security email (staff passkeys spec § Design 5):
// someone added or removed from Frrata staff, a passkey request approved, a passkey added or removed. Sent to the
// person concerned and to every admin, so a change nobody expected is seen at once.
// =============================================================================

export type StaffNoticeKind = 'staff_added' | 'staff_removed' | 'request_approved' | 'passkey_added' | 'passkey_removed'

export function staffSecurityWords(n: { kind: StaffNoticeKind; about: string; by: string | null; detail: string | null }): { subject: string; body: string } {
  const by = n.by ?? 'Frrata'
  const key = n.detail ? ` "${n.detail.slice(0, 40)}"` : ''
  switch (n.kind) {
    case 'staff_added': return { subject: `${n.about} was added to Frrata staff`, body: `${by} added ${n.about} to Frrata staff.` }
    case 'staff_removed': return { subject: `${n.about} was removed from Frrata staff`, body: `${by} removed ${n.about} from Frrata staff. Their passkeys and any open support visit have ended.` }
    case 'request_approved': return { subject: `A new passkey was approved for ${n.about}`, body: `${by} approved a request from ${n.about} to add a passkey. It can be used for 10 minutes, on the browser that asked.` }
    case 'passkey_added': return { subject: `${n.about} added a passkey`, body: `${n.about} added the passkey${key} to their Frrata staff account.` }
    case 'passkey_removed': return { subject: `A passkey was removed from ${n.about}`, body: `${by} removed the passkey${key} from ${n.about}.` }
  }
}
