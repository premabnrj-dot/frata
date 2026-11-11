import Link from 'next/link'
import { resolvePage, type FaqNode, type PageNode } from '@/domains/pages/page'
import type { PageDraft, PageTemplate } from '@/domains/pages/templates'
import type { StoreShop } from '@/lib/queries/storefront'
import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'
import { BlockNode } from '../blocks'
import { wrap } from '../sections/parts'
import type { Href } from '../shell'

// =============================================================================
// FILE: src/components/storefront/shop-pages/index.tsx — a shop's About or FAQ page (Theme Studio TS1a, board v2).
// Server only, no client script. The page title is the h1; the template's blocks render with TS0b's BlockNode; the FAQ
// is a list of <details>, its bound answers in the policy's own words (or a link to the owner's rewritten policy).
// `examples`: the customizer's preview (the theme's samples and examples, marked); the shop never shows them.
// =============================================================================

const inr = (p: number) => formatInr(paise(p))

function Faq({ n, href }: { n: FaqNode; href: Href }) {
  return (
    <div className="store-b-acc">
      {n.items.map((i, k) => (
        <details key={k}><summary>{i.q}</summary>
          <p {...(i.example ? { 'data-example': '' } : {})}>{i.href ? <Link href={href(i.href)} className="underline underline-offset-4">{i.a}</Link> : i.a}</p>
        </details>
      ))}
    </div>
  )
}

export function PageView({ shop, page, href, examples = false }: { shop: StoreShop; page: { template: PageTemplate; title: string; fill: PageDraft['fill'] }; href: Href; examples?: boolean }) {
  const nodes: PageNode[] = resolvePage(page.template, page.fill, examples ? 'preview' : 'shop', { facts: shop, overrides: shop.overrides, inr }, true)
  return (
    <article className={`${wrap} store-b-design max-w-4xl py-10`}>
      <h1 className="text-3xl leading-[1.05] text-balance sm:text-5xl" style={{ fontFamily: 'var(--store-display)' }}>{page.title}</h1>
      {nodes.map((n) => (n.kind === 'faq' ? <Faq key={n.id} n={n} href={href} /> : <BlockNode key={n.id} n={n} href={href} sid="page" cols={1} />))}
    </article>
  )
}
