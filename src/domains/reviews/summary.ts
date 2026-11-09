// =============================================================================
// FILE: src/domains/reviews/summary.ts — the numbers a product page shows (Reviews R1): average, count, the bars,
// and the fit. Computed once, from published reviews only; the widget, the card stars and the markup all read it.
// =============================================================================

export type Fit = 'small' | 'true' | 'large'
export const FITS: readonly { key: Fit; label: string }[] = [{ key: 'small', label: 'Runs small' }, { key: 'true', label: 'True to size' }, { key: 'large', label: 'Runs large' }]

export type Summary = {
  count: number
  /** 1 decimal, 0 with no reviews. */
  average: number
  /** Index 0 is 5★ … index 4 is 1★: how many, and the share in whole percent (bars). */
  bars: { stars: number; n: number; pct: number }[]
  fit: { answers: number; small: number; true: number; large: number } | null
}

export function summarize(rows: readonly { rating: number; fit: Fit | null }[]): Summary {
  const count = rows.length
  const sum = rows.reduce((s, r) => s + r.rating, 0)
  const bars = [5, 4, 3, 2, 1].map((stars) => {
    const n = rows.filter((r) => r.rating === stars).length
    return { stars, n, pct: count ? Math.round((n / count) * 100) : 0 }
  })
  const fits = rows.filter((r) => r.fit)
  const fit = fits.length ? { answers: fits.length, small: fits.filter((r) => r.fit === 'small').length, true: fits.filter((r) => r.fit === 'true').length, large: fits.filter((r) => r.fit === 'large').length } : null
  return { count, average: count ? Math.round((sum / count) * 10) / 10 : 0, bars, fit }
}

/**
 * Where the fit marker sits on the bar, 0 (runs small) to 1 (runs large); 0.5 is true to size. Null below 3
 * answers: one shopper is not a fit.
 */
export function fitPosition(f: Summary['fit']): number | null {
  if (!f || f.answers < 3) return null
  return Math.round(((f.large - f.small) / f.answers / 2 + 0.5) * 100) / 100
}

/** "Size M runs small for 46% of buyers": the line under the bar, only for a size with ≥ 5 answers leaning one way. */
export function sizeLine(bySize: readonly { size: string; fit: Fit }[]): string | null {
  const sizes = [...new Set(bySize.map((r) => r.size))]
  let best: { size: string; way: Fit; pct: number } | null = null
  for (const size of sizes) {
    const these = bySize.filter((r) => r.size === size)
    if (these.length < 5) continue
    for (const way of ['small', 'large'] as const) {
      const pct = Math.round((these.filter((r) => r.fit === way).length / these.length) * 100)
      if (pct >= 40 && (!best || pct > best.pct)) best = { size, way, pct }
    }
  }
  return best ? `Size ${best.size} runs ${best.way} for ${best.pct}% of buyers` : null
}
