// The starting size charts a shop gets, from what it said it sells (all of the common ones if it skipped): the category
// packs' chart keys, as charts. Its own file, so neither the packs nor size-charts.ts (both read by client components)
// carries the other: only the server's ensureTypes (src/lib/catalogue/handles.ts) reads this.
import { chartKeys } from './packs'
import { PRESETS, type Preset } from './size-charts'

export const presetsFor = (sells: readonly string[]): Preset[] => chartKeys(sells).map((k) => PRESETS[k])
