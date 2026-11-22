// The checkout's State choices, drawn on the server and handed to the form (checkout.tsx): the 36 names never ship in
// checkout's first-load script (budget 120 kB; one-address P2 release, 2026-11-22). Validation reads the same list
// (src/domains/checkout/states.ts) in its own lazy chunk.
import { STATES } from '@/domains/checkout/state-names'

export const STATE_OPTIONS = STATES.map((s) => <option key={s}>{s}</option>)
