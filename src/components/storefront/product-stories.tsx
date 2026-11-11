import Link from 'next/link'
import type { Story } from '@/domains/catalogue/stories'
import { pairRowsOf } from '@/domains/storefront/pairs'
import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'
import type { StoreCard } from '@/lib/queries/storefront'
import { Photo } from './photo'
import { PairAdd } from './pair-add'
import { fill } from './fill'
import type { BuyWords, Words } from './words'
import type { Href } from './shell'

// Signal S3 (board "Product page"): the piece's stories and "Pair it with", drawn on the server — no script for the
// stories (a scroll-snap row), one tiny island for Add. Offered by Signal 1.3 (allowed.productStories, pairWith).

function Notes({ notes }: { notes: string[] }) {
  if (!notes.length) return null
  return (
    <ol className="store-story-notes mx-auto mt-4 grid max-w-sm gap-2 text-left text-sm text-store-sub">
      {notes.map((n, i) => <li key={i} className="flex items-baseline justify-between gap-3 border-b border-dashed border-store-line pb-1.5"><span>{n}</span><span aria-hidden="true" className="font-medium tabular-nums text-store-ink">{i + 1}</span></li>)}
    </ol>
  )
}
const altOf = (s: Story) => (s.image?.decorative ? '' : s.image?.alt || s.title)

/** Under a stacked gallery: each story a tile, one under the other. */
export function StoriesStacked({ stories, w }: { stories: Story[]; w: Words }) {
  if (!stories.length) return null
  return (
    <section aria-label={w.stories} className="store-stories mt-3 space-y-3">
      {stories.map((s, i) => (
        <article key={i} className="store-story bg-store-chip px-5 py-7 text-center sm:px-7">
          {s.title && <h2 className="text-2xl font-semibold leading-tight tracking-tight [text-wrap:balance]">{s.title}</h2>}
          {s.text && <p className="mx-auto mt-2 max-w-prose text-sm text-store-sub">{s.text}</p>}
          {s.image && <Photo p={s.image} alt={altOf(s)} sizes="(min-width: 768px) 50vw, 100vw" className="mx-auto mt-4 w-full max-w-md object-contain" />}
          <Notes notes={s.notes} />
        </article>
      ))}
    </section>
  )
}

/** Any other gallery: the stories as slides under the page, "n / N" on each; one story has no counter. */
export function StoriesSlides({ stories, w }: { stories: Story[]; w: Words }) {
  if (!stories.length) return null
  const many = stories.length > 1
  return (
    <section aria-label={w.stories} className="store-stories mt-10 border-t border-store-line pt-8">
      <ul tabIndex={many ? 0 : undefined} aria-label={many ? w.stories : undefined} className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        {stories.map((s, i) => (
          <li key={i} className="grid w-full shrink-0 snap-start items-center gap-6 md:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] md:gap-7" aria-roledescription={many ? 'slide' : undefined}>
            <div>
              {many && <p className="text-sm font-medium tabular-nums text-store-sub">{fill(w.storyOf, { i: i + 1, n: stories.length })}</p>}
              {s.title && <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl [text-wrap:balance]">{s.title}</h2>}
              {s.text && <p className="mt-2 max-w-[42ch] text-store-sub">{s.text}</p>}
              <Notes notes={s.notes} />
            </div>
            {s.image ? <div className="bg-store-chip"><Photo p={s.image} alt={altOf(s)} sizes="(min-width: 768px) 55vw, 100vw" className="aspect-[16/10] w-full object-cover" /></div> : <div className="hidden md:block" />}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** "Pair it with" under the buy button (which pieces and how: pairRowsOf). `href` keeps the preview's links inside it. */
export function PairRows({ pairs, now, live, w, bw, href }: { pairs: StoreCard[]; now: Date; live: boolean; w: Words; bw: BuyWords; href: Href }) {
  const rows = pairRowsOf(pairs, now)
  if (!rows.length) return null
  return (
    <div className="store-pair space-y-1.5">
      <h2 className="text-sm font-semibold">{w.pairWith}</h2>
      <ul className="space-y-1.5">
        {rows.map(({ piece: q, price, act, variantId }) => (
          <li key={q.id} className="store-pair-row grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 bg-store-chip p-2">
            {q.images[0] ? <Photo p={q.images[0]} alt="" sizes="52px" low className="size-13 bg-store-paper object-cover" /> : <span className="size-13 bg-store-paper" />}
            <Link href={href(`/products/${q.handle}`)} className="min-w-0 truncate text-sm">{q.title} · {formatInr(paise(price))}</Link>
            {act === 'add'
              ? <PairAdd variantId={variantId} productId={q.id} label={w.pairAdd} done={w.pairAdded} sr={fill(w.pairAddSr, { title: q.title })} live={live} preview={bw.preview} />
              : <Link href={href(`/products/${q.handle}`)} aria-label={fill(w.pairChooseSr, { title: q.title })} className="inline-flex min-h-11 shrink-0 items-center rounded-[var(--store-radius)] border border-store-ink px-3 text-xs font-bold uppercase tracking-wider">{w.pairChoose}</Link>}
          </li>
        ))}
      </ul>
    </div>
  )
}
