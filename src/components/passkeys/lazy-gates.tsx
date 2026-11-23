'use client'

import dynamic from 'next/dynamic'

// =============================================================================
// FILE: src/components/passkeys/lazy-gates.tsx — the two passkey gates, loaded only when a layout renders one (passkeys,
// simpler P0; speed: every Frrata Admin and partner workspace page used to carry the gate's script, about 3 kB gz, though
// a person meets it once per check). Rendered on the server as before; the browser fetches the gate's chunk with it.
// =============================================================================

export const StaffGate = dynamic(() => import('./passkey-gate').then((m) => m.StaffGate))
export const PartnerGate = dynamic(() => import('./partner-gate').then((m) => m.PartnerGate))
