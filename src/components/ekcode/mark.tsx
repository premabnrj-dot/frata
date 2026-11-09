import { TILE_E, TILE_EK, WORD_CODE, WORD_EK } from './mark-paths'

// =============================================================================
// FILE: src/components/ekcode/mark.tsx — EKCODE'S MARK, DRAWN (frata-design-language § EkCode). Server components only:
// the paths are rendered into the page's HTML and never ship in a client bundle (speed review H1). The box is a code
// cell, the bar under एक its cursor. `ink` on light surfaces, `paper` on dark ones.
// =============================================================================

type Tone = 'ink' | 'paper'
const fg = (t: Tone) => (t === 'ink' ? 'var(--ek-ink)' : 'var(--ek-paper)')
const cursor = (t: Tone) => (t === 'ink' ? 'var(--ek-cursor)' : 'var(--ek-cursor-on-ink)')

/** एक in its box, "Code" open beside it. Height in px; width follows (330 × 100). */
export function EkMark({ height = 22, tone = 'ink', label = true }: { height?: number; tone?: Tone; label?: boolean }) {
  return (
    <svg viewBox="0 0 330 100" height={height} width={(height * 330) / 100} role={label ? 'img' : undefined} aria-label={label ? 'EkCode' : undefined} aria-hidden={label ? undefined : true} focusable="false">
      <rect x="3" y="5" width="126" height="90" rx="16" fill="none" stroke={fg(tone)} strokeWidth="6" />
      <path d={WORD_EK} fill={fg(tone)} />
      <rect x="48" y="80" width="36" height="5" rx="2.5" fill={cursor(tone)} />
      <path d={WORD_CODE} fill={fg(tone)} />
    </svg>
  )
}

/** The box alone: filled ink, paper letters (below 24 px only ए). */
export function EkTile({ size = 48 }: { size?: number }) {
  const small = size < 24
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="14" fill="var(--ek-ink)" />
      <path d={small ? TILE_E : TILE_EK} fill="var(--ek-paper)" />
      {small ? <rect x="20" y="52" width="24" height="7" rx="3" fill="var(--ek-cursor-on-ink)" /> : <rect x="22" y="48" width="20" height="3.2" rx="1.6" fill="var(--ek-cursor-on-ink)" />}
    </svg>
  )
}
