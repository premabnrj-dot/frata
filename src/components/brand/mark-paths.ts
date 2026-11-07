// =============================================================================
// FILE: src/components/brand/mark-paths.ts — THE frrata mark, drawn once.
//
// The wordmark is drawn, not typed (brand spec docs/specs/2026-11-07-brand-frrata.md, direction A "Thread"): a
// geometric lowercase on a 14-unit stroke, baseline 100, x-height 54. The first r's arm runs on to within a
// 3-unit stitch of the second r: joined, it read as "nr" or "π". Every mark in the product — <Wordmark>,
// <Monogram>, the platform icon (src/components/brand/app-icon.tsx, served at /frrata-icon) — reads these paths.
// The hex values exist for the generated icons only (an image cannot read CSS); a test holds them equal to
// globals.css (--brand, --brand-on-ink, --primary, --primary-foreground).
// =============================================================================

export const WORDMARK_VIEWBOX = '-6 12 302 92'
export const STROKE = 14

/** Every stroke of the word but the thread, in reading order: f, r, r, a, t, a. */
export const WORD = [
  'M7 100 V42 A20 20 0 0 1 27 22 H38', 'M0 53 H31',
  'M51 100 V46',
  'M96 100 V46', 'M96 77 A24 24 0 0 1 120 53 H128',
  'M183 73 A20 20 0 1 1 143 73 A20 20 0 1 1 183 73', 'M183 46 V100',
  'M208 30 V76 A17 17 0 0 0 225 93 H234', 'M196 53 H230',
  'M287 73 A20 20 0 1 1 247 73 A20 20 0 1 1 287 73', 'M287 46 V100',
] as const

/** The stitch: 3 units between the thread's end and the second r's stem edge, at any stroke (a heavier stroke ends the thread earlier). */
export const STITCH = 3
/** The thread at a stroke width: the first r's arm, stopping a stitch short of the second r. The one part that may be rani. */
export const threadPath = (sw: number = STROKE) => `M51 77 A24 24 0 0 1 75 53 H${96 - sw / 2 - STITCH}`
export const THREAD = threadPath(STROKE)

/** The monogram: the rr alone (r1 stem, r2 stem and arm, the thread) on a 120 square, radius 23%. */
export const MONOGRAM = { viewBox: '0 0 120 120', radius: 27.6, translate: 'translate(-26 -16)', parts: ['M51 100 V46', 'M96 100 V46', 'M96 77 A24 24 0 0 1 120 53 H128'] as const }

/** For generated images only (favicon, app icons). Equal to globals.css's --brand, --primary and --primary-foreground (test). */
export const HEX = { rani: '#D61F69', raniOnInk: '#FF4F93', ink: '#1C1917', paper: '#FFFFFF' } as const
