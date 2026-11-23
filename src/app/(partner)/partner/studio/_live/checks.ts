// Studio's entry state 1b: the passkey checks a sign-in needs, in order (owner 2026-11-23). One list for the page's
// lines and the button: if a staff passkey comes to count as the partner check (lane G's passkey redesign), deleting
// the partner entry leaves one line and one button.
export const STUDIO_CHECKS = [
  { key: 'staff', line: 'Staff passkey', button: 'Confirm staff passkey', done: 'Staff passkey confirmed.', endpoint: '/admin/passkey' },
  { key: 'partner', line: 'Partner passkey', button: 'Confirm partner passkey', done: 'Partner passkey confirmed.', endpoint: '/partner/passkey' },
] as const
export type StudioCheck = (typeof STUDIO_CHECKS)[number]['key']
