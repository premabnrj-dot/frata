import type { ThemeManifest } from '../types'
import { classic_1_0_0 } from './classic/1.0.0'

// The themes in this build. A version is added as a new file and listed here; a listed file never changes (T3's
// git gate enforces it). T1 adds Editorial, Bazaar, Minimal and Atelier.
export const CATALOGUE: Record<string, Record<string, ThemeManifest>> = {
  classic: { '1.0.0': classic_1_0_0 },
}

export function manifestOf(key: string, version: string): ThemeManifest | null {
  return CATALOGUE[key]?.[version] ?? null
}
