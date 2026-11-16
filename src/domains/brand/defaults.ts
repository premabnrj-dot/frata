// =============================================================================
// FILE: src/domains/brand/defaults.ts — the palette a brand record starts from before anyone saves one (one-address
// plan P1·1; mockup docs/mockups/2026-11-16-p1-brand.html, screen 2 "Frrata's colours until changed"). Colours here are
// data, as a theme manifest's are (check:hex QUOTED_OK names this file). Pure.
// =============================================================================

import type { Hex, Palette } from './record'

/** Frrata's own neutral palette: every pair passes its check (brand.test.ts holds it). */
export const DEFAULT_PALETTE: Palette = {
  bg: '#FFFFFF', panel: '#F6F5F3', text: '#171615', muted: '#67625C', accent: '#171615', on: '#FFFFFF',
  edge: '#8F8A84', line: '#E3E1DD', good: '#1A6B43', warn: '#85500B', bad: '#A82828',
}

/** A theme shop's text on its accent: white, as its emails have always drawn it. */
export const THEME_ON: Hex = '#FFFFFF'
