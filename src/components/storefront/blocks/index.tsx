import { resolveDesign, type RNode } from '@/domains/themes/blocks'
import type { SectionOf } from '@/domains/themes/sections'
import { Photo } from '../photo'
import type { SectionCtx } from '../sections'
import { Button, Label, Runs, Sized, pad, wrap } from '../sections/parts'

// =============================================================================
// FILE: src/components/storefront/blocks/index.tsx — a design on the shop (Theme Studio TS0b). Server components only:
// no client script on any shop route. The theme's design and the owner's words are merged by the pure
// resolveDesign (on the shop: never a sample photo or an example). Layout is a closed set of classes and data
// attributes with one rule each in base.css (.store-b-*). A block never reads data: the section passes what it has.
// =============================================================================

const SIZE = { l: 'text-3xl sm:text-5xl', m: 'text-2xl sm:text-3xl', s: 'text-lg sm:text-xl' } as const
/** How wide a photo shows, by the columns it sits in (one rule, for `sizes`). */
const sizesFor = (cols: number) => (cols > 1 ? `(min-width: 640px) ${Math.round(100 / cols)}vw, 100vw` : '(min-width: 640px) 60vw, 100vw')

function Node({ n, ctx, sid, cols }: { n: RNode; ctx: SectionCtx; sid: string; cols: number }): React.ReactNode {
  const ex = 'example' in n && n.example ? { 'data-example': '' } : {}
  switch (n.kind) {
    case 'heading': {
      const H = n.level === 2 ? 'h2' : 'h3'
      return <H id={`${sid}-${n.id}`} className={`${SIZE[n.size]} leading-[1.05] text-balance`} style={{ fontFamily: 'var(--store-display)' }} {...ex}><Sized>{n.text}</Sized></H>
    }
    case 'text': return <div className="max-w-prose space-y-3 leading-relaxed text-store-sub" {...ex}><Runs body={n.body} href={ctx.href} /></div>
    case 'image': {
      const img = n.image
      return (
        <div className="store-b-photo" data-ratio={n.ratio} {...(n.sample ? { 'data-example': '' } : {})}>
          <Photo p={img} focus={img.focus} alt={img.decorative ? '' : img.alt} sizes={sizesFor(cols)} priority={!!n.eager} className="absolute inset-0 h-full w-full object-cover" />
        </div>
      )
    }
    case 'button': return <Button b={{ label: n.label, link: n.link }} href={ctx.href} />
    case 'accordion': return (
      <div className="store-b-acc">
        {n.items.map((i, k) => (
          <details key={k}><summary>{i.q}</summary><p {...(i.example ? { 'data-example': '' } : {})}>{i.a}</p></details>
        ))}
      </div>
    )
    case 'group': return <div className="store-b-group">{n.children.map((c) => <Node key={c.id} n={c} ctx={ctx} sid={sid} cols={cols} />)}</div>
    case 'columns': return (
      <div className="store-b-cols" data-cols={n.children.length} data-phone={n.phone}>
        {n.children.map((c) => <div key={c.id} className="store-b-col"><Node n={c} ctx={ctx} sid={sid} cols={n.children.length} /></div>)}
      </div>
    )
    default: return n satisfies never
  }
}

/** A design section: nothing at all when nothing in it may show (every block empty on the shop). */
export function DesignSection({ s, ctx }: { s: SectionOf<'design'>; ctx: SectionCtx }) {
  const ds = ctx.theme.designs
  const d = ds && Object.hasOwn(ds, s.design) ? ds[s.design]! : null
  if (!d) return null
  const nodes = resolveDesign(d, s.fill, ctx.preview && ctx.samples ? 'preview' : 'shop', !!ctx.lead)
  if (!nodes.length) return null
  const first = (ns: RNode[]): RNode | undefined => { for (const n of ns) { if (n.kind === 'heading') return n; if (n.kind === 'group' || n.kind === 'columns') { const f = first(n.children); if (f) return f } } }
  const h = first(nodes)
  return (
    <section aria-labelledby={h ? `${s.id}-${h.id}` : undefined} className={`${wrap} ${pad} store-b-design`} data-design={d.id}>
      <Label text={s.label} />
      {nodes.map((n) => <Node key={n.id} n={n} ctx={ctx} sid={s.id} cols={1} />)}
    </section>
  )
}
