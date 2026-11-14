// =============================================================================
// FILE: src/components/shell/rail.ts — THE SIDEBAR'S WIDTH, AS THE PERSON CHOSE IT (Neel N1, § Layout · Sidebar).
//
// The `rail` cookie: '1' the 64 px rail at every width, '0' the full sidebar at every width (it overrides the rail
// that CSS draws from 768 to 1279 px), anything else (or none) the default: by width. Read by the console, Admin and
// partner layouts; only these two values are ever trusted.
// =============================================================================

export type RailChoice = 'rail' | 'full' | null

export function railFrom(value: string | undefined): RailChoice {
  return value === '1' ? 'rail' : value === '0' ? 'full' : null
}

/** The attribute the shell draws from it (src/app/neel.css). */
export const railAttr = (c: RailChoice): '1' | '0' | undefined => (c === 'rail' ? '1' : c === 'full' ? '0' : undefined)
