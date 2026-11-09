import type { SectionOf } from '@/domains/themes/sections'
import { Photo } from '../photo'
import { Loop, LoopPoster } from './loop'
import { Button, H2, Label, wrap, pad } from './parts'
import type { SectionCtx } from './index'

// =============================================================================
// FILE: sections/story.tsx — Signal 1.2's story sections (plan docs/plans/2026-11-09-signal-s2.md; approved board
// "Home · computer"): Image with text as a Spotlight, the Story fan, the Statement. Server-drawn, no script. An empty
// one renders nothing (readiness says so; it never stops a publish).
// =============================================================================

/** Words beside a wide photo or loop, on the theme's tile (the board's "In spotlight"). Its photo leads when it opens the page. */
export function Spotlight({ s, ctx }: { s: SectionOf<'image_text'>; ctx: SectionCtx }) {
  const loop = s.video && ctx.videos?.[s.video.id] ? s.video.id : undefined
  if (!s.image && !loop) return null
  const h = `${s.id}-h`, lead = !!ctx.lead
  return (
    <section aria-labelledby={h} className="store-spotlight bg-store-chip">
      <div className={`${wrap} ${pad} grid items-center gap-8 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)] sm:gap-10`}>
        <div className={`space-y-4 ${s.side === 'right' ? 'sm:order-2' : ''}`}>
          <Label text={s.label} /><H2 id={h}>{s.heading}</H2>
          {s.text && <p className="max-w-[36ch] leading-relaxed text-store-sub">{s.text}</p>}
          <Button b={s.button} href={ctx.href} />
        </div>
        <div className="relative aspect-[2/1] overflow-hidden rounded-[var(--store-radius)] bg-store-chip">
          {s.image ? <Photo p={s.image} focus={s.image.focus} alt={s.image.decorative ? '' : s.image.alt} sizes="(min-width: 640px) 64vw, 100vw" priority={lead} className="absolute inset-0 h-full w-full object-cover" />
            : <LoopPoster id={loop} videos={ctx.videos} lead={lead} width={1200} />}
          <Loop id={s.video?.id} videos={ctx.videos} />
        </div>
      </div>
    </section>
  )
}

/**
 * Story cards fanned out, the middle one forward (a list; each card's place is set here: --d its offset from the
 * middle, --a its distance). Phone: a swipe row. Reduced motion or the theme's motion off: side by side (base.css). A
 * focused card comes forward.
 */
export function StoryFan({ s, ctx }: { s: SectionOf<'story_fan'>; ctx: SectionCtx }) {
  const cards = s.cards.filter((c) => c.image)
  if (cards.length < 3) return null
  const h = `${s.id}-h`, mid = (cards.length - 1) / 2, links = cards.some((c) => c.link)
  return (
    <section aria-labelledby={h} className={`${wrap} ${pad}`}>
      <div className="mb-2 space-y-2"><Label text={s.label} />{s.heading ? <H2 id={h}>{s.heading}</H2> : <h2 id={h} className="sr-only">Stories</h2>}</div>
      {s.text && <p className="max-w-prose text-sm text-store-sub">{s.text}</p>}
      <ul className="store-fan" style={{ '--n': cards.length } as React.CSSProperties} {...(links ? {} : { tabIndex: 0, 'aria-label': s.heading || 'Stories' })}>
        {cards.map((c, i) => {
          const d = i - mid, img = c.image!
          const inner = (<>
            <Photo p={img} focus={img.focus} alt={c.title ? '' : img.decorative ? '' : img.alt} sizes="(min-width: 640px) 22vw, 72vw" priority={!!ctx.lead && d === 0} className="store-fan-img absolute inset-0 h-full w-full object-cover" />
            {c.title && <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent p-3 pt-10 text-sm font-medium text-white">{c.title}</span>}
          </>)
          return (
            <li key={i} style={{ '--d': d, '--a': Math.abs(d) } as React.CSSProperties}>
              {c.link ? <a href={ctx.href(c.link)} className="relative block h-full overflow-hidden rounded-[var(--store-radius)]">{inner}</a>
                : <div className="relative h-full overflow-hidden rounded-[var(--store-radius)]">{inner}</div>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** A full-bleed photo under a dark scrim, a small line and a handwritten wordmark (Caveat). Never the page's lead paint. */
export function Statement({ s }: { s: SectionOf<'statement'> }) {
  if (!s.image || !s.wordmark.trim()) return null
  return (
    <section data-bleed="" className="store-statement relative grid min-h-[clamp(16rem,30vw,22rem)] place-items-center overflow-hidden text-center text-white">
      <Photo p={s.image} focus={s.image.focus} alt={s.image.decorative ? '' : s.image.alt} sizes="100vw" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" />
      <p className="relative px-4">
        {s.eyebrow && <span className="mb-2 block text-[0.6875rem] font-semibold uppercase tracking-[0.2em]" style={{ fontFamily: 'var(--store-display)' }}>{s.eyebrow}</span>}
        <span className="store-script block">{s.wordmark}</span>
      </p>
    </section>
  )
}
