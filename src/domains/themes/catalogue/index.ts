import type { ThemeManifest } from '../types'
import { atelier_1_0_0 } from './atelier/1.0.0'
import { bazaar_1_0_0 } from './bazaar/1.0.0'
import { bazaar_2_0_0 } from './bazaar/2.0.0'
import { bazaar_2_1_0 } from './bazaar/2.1.0'
import { classic_1_0_0 } from './classic/1.0.0'
import { editorial_1_0_0 } from './editorial/1.0.0'
import { editorial_1_1_0 } from './editorial/1.1.0'
import { editorial_2_0_0 } from './editorial/2.0.0'
import { editorial_2_1_0 } from './editorial/2.1.0'
import { minimal_1_0_0 } from './minimal/1.0.0'
import { minimal_2_0_0 } from './minimal/2.0.0'
import { minimal_2_1_0 } from './minimal/2.1.0'
import { signal_1_0_0 } from './signal/1.0.0'
import { signal_1_1_0 } from './signal/1.1.0'
import { signal_1_2_0 } from './signal/1.2.0'

// The themes in this build. A version is added as a new file and listed here; a listed file never changes (T3's
// git gate enforces it).
export const CATALOGUE: Record<string, Record<string, ThemeManifest>> = {
  classic: { '1.0.0': classic_1_0_0 },
  editorial: { '1.0.0': editorial_1_0_0, '1.1.0': editorial_1_1_0, '2.0.0': editorial_2_0_0, '2.1.0': editorial_2_1_0 },
  bazaar: { '1.0.0': bazaar_1_0_0, '2.0.0': bazaar_2_0_0, '2.1.0': bazaar_2_1_0 },
  minimal: { '1.0.0': minimal_1_0_0, '2.0.0': minimal_2_0_0, '2.1.0': minimal_2_1_0 },
  atelier: { '1.0.0': atelier_1_0_0 },
  signal: { '1.0.0': signal_1_0_0, '1.1.0': signal_1_1_0, '1.2.0': signal_1_2_0 },
}

export function manifestOf(key: string, version: string): ThemeManifest | null {
  return CATALOGUE[key]?.[version] ?? null
}

/**
 * The version a stored revision renders with: its own, else the newest of the same theme at or below it (a build
 * without that version, e.g. after a revert), else the theme's oldest. Never another theme (T2 review).
 */
export function manifestNear(key: string, version: string): ThemeManifest | null {
  const vs = CATALOGUE[key]; if (!vs) return null
  if (vs[version]) return vs[version]!
  const sorted = Object.keys(vs).sort((a, b) => cmpSemver(b, a))
  const v = sorted.find((x) => cmpSemver(x, version) <= 0) ?? sorted.at(-1)
  return v ? vs[v]! : null
}

export const cmpSemver = (a: string, b: string) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i]! !== y[i]!) return x[i]! - y[i]!; return 0 }
/**
 * The themes a shop is offered to try (plan 2026-11-09-themes-three): three, each with its own job. Classic stays the
 * look of a shop that never published and the fallback; Atelier lives on inside Editorial 2. A shop already on
 * either keeps its look (and its card at the top of Look).
 */
export const OFFERED = ['editorial', 'bazaar', 'minimal', 'signal'] as const
