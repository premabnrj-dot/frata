// =============================================================================
// FILE: src/domains/delivery/counts.ts — how many of India Post's PIN codes each zone takes (the console's Zones
// column), by THE rule's own matching (zoneFor): a brand's zone that lists the code or its prefix, then the presets in
// order. Pure; the directory's codes are read once a day (src/lib/db/platform.ts directoryPins).
// =============================================================================

import { zoneFor, type Zone } from './resolve'

export function zoneCounts(directory: readonly string[], zones: readonly Zone[], own: ReadonlyMap<string, string>): Map<string, number> {
  const out = new Map<string, number>(zones.map((z) => [z.id, 0]))
  if (!zones.length) return out
  for (const pin of directory) {
    const mine = own.get(pin) ?? own.get(pin.slice(0, 3))
    const z = zoneFor(pin, { zones, ownZoneIds: mine ? [mine] : [], rule: null })
    if (z) out.set(z.id, (out.get(z.id) ?? 0) + 1)
  }
  return out
}
