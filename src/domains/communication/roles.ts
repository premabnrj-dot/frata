// Who may connect, check or disconnect a shop's WhatsApp: the owner or an admin, never a Frrata support visit
// (it is the merchant's own Meta account). One rule, read by the page and every action (impact review of C1).
export const canManageWhatsApp = (m: { role: string; supportSessionId: string | null }) =>
  (m.role === 'owner' || m.role === 'admin') && !m.supportSessionId
