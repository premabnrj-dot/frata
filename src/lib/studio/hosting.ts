import 'server-only'

// =============================================================================
// FILE: src/lib/studio/hosting.ts — WHAT STUDIO NEEDS FROM HOSTING, BEHIND ONE INTERFACE (plan
// docs/plans/2026-11-22-v3a-runtime.md § The hosting stand-in). V2a (sites, site_deployments, the fleet, the gate) is not
// built, so `preview_build` answers "not available yet" through StandInHosting. What V2a must provide behind this port:
// `sites` and `site_deployments` keyed by tenant (read in src/lib/queries/sites.ts); an outbox `site.build` for the
// branch head Frrata reads (never a SHA from the model or a caller), one in flight per site, at a turn's end only; the
// fleet's answer through webhook_events with the shop from the site_deployments row; the gate's verdict and
// frrata/fields.json, capped at 64 kB; a preview URL on the preview domain behind protection, frame-ancestors the
// console only. The repository token and the instruction-file check are V3a·7's, not hosting's.
// =============================================================================

import type { TurnRef } from './as-turn'
export type GateVerdict = { passed: boolean; checks: { name: string; ok: boolean }[] }
export type EditableField = { key: string; label: string }

export interface HostingPort {
  /** A preview of the session branch's head, which the port reads itself. */
  previewFor(turn: TurnRef): Promise<{ ok: true; deploymentId: string } | { ok: false; why: 'not_available' | 'busy' }>
  status(turn: TurnRef, deploymentId: string): Promise<{ state: 'queued' | 'building' | 'ready' | 'failed'; url?: string; gate?: GateVerdict; editable?: EditableField[] }>
}

/** Until V2a: no previews. */
export const standInHosting: HostingPort = {
  async previewFor() { return { ok: false, why: 'not_available' } },
  async status() { return { state: 'failed' } },
}
