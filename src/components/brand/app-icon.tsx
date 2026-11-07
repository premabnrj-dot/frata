import { ImageResponse } from 'next/og'
import { HEX, MONOGRAM, threadPath } from './mark-paths'

/**
 * The platform's tab and home-screen icon, drawn from the mark's own paths (no committed image to drift): an ink
 * square, paper rr, the thread in rani. Served by /frrata-icon and /frrata-apple-icon for the platform's pages
 * only — a shop's tab never shows Frrata's icon (src/app/s/[host]/layout.tsx).
 */
export function appIcon(px: number) {
  const sw = px <= 32 ? 18 : 15
  return new ImageResponse(
    (
      <div style={{ width: px, height: px, display: 'flex' }}>
        <svg width={px} height={px} viewBox={MONOGRAM.viewBox}>
          <rect width="120" height="120" rx={px >= 128 ? 0 : MONOGRAM.radius} fill={HEX.ink} />
          <g transform={MONOGRAM.translate} fill="none" stroke={HEX.paper} strokeWidth={sw} strokeLinejoin="round">
            {MONOGRAM.parts.map((d) => <path key={d} d={d} />)}
            <path d={threadPath(sw)} stroke={HEX.raniOnInk} />
          </g>
        </svg>
      </div>
    ),
    { width: px, height: px },
  )
}
