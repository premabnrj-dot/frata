import { thumbOf } from '@/domains/themes/design-tree'
import type { Design } from '@/domains/themes/blocks'

/** TS0b: a design's picture, drawn from its blocks (thumbOf). Rendered on the server and passed in (speed review 4). */
export function DesignThumb({ design }: { design: Pick<Design, 'children'> }) {
  const marks = thumbOf(design)
  const o = { heading: 0.75, text: 0.35, photo: 0.22, button: 0.85, row: 0.14 } as Record<string, number>
  return <svg viewBox="0 0 160 100" className="block h-24 w-full" aria-hidden="true">{marks.map((m, i) => <rect key={i} x={m.x} y={m.y} width={m.w} height={m.h} rx={m.kind === 'photo' ? 2 : 1} fill="currentColor" opacity={o[m.kind] ?? 0.3} />)}</svg>
}
