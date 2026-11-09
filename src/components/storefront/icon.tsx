import 'server-only'
import { DUOTONE, LINE, SOLID } from '@/domains/icons/data'
import type { IconName } from '@/domains/icons/names'
import type { SiteSettings } from '@/domains/themes/site'

// =============================================================================
// FILE: src/components/storefront/icon.tsx — a shop icon, drawn on the server as inline SVG (Look v4 § Icons).
// Only the icons a page uses reach its HTML; no icon font, no script. The path data stays on the server (server-only;
// check-storefront-build fails a shop chunk that holds it). A client island gets the rendered element as a prop.
// Colour is currentColor; the line stroke is --icon-stroke (the shell sets it from the shop's stroke weight).
// =============================================================================

export type IconSet = SiteSettings['icons']
const SETS = { line: LINE, duotone: DUOTONE, solid: SOLID } as const

export function ShopIcon({ name, set, className = 'size-5' }: { name: IconName; set: IconSet; className?: string }) {
  const nodes = SETS[set.library][name]
  const line = set.library === 'line'
  return (
    <svg aria-hidden="true" focusable="false" viewBox={line ? '0 0 24 24' : '0 0 256 256'} className={`store-icon shrink-0 ${className}`}
      {...(line ? { fill: 'none', stroke: 'currentColor', strokeWidth: 'var(--icon-stroke, 1.5)', strokeLinecap: 'round', strokeLinejoin: 'round' } : { fill: 'currentColor' })}>
      {nodes.map(([tag, a], i) => {
        // Only the shapes the generator writes (path, circle, rect, line, polyline, ellipse, polygon), attributes as data.
        const T = tag as 'path'
        const props = Object.fromEntries(Object.entries(a).map(([k, v]) => [k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()), v]))
        return <T key={i} {...props} />
      })}
    </svg>
  )
}
