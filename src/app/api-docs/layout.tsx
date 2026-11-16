// The app's stylesheet (Signal S2-0: the root loads only the shop's sheet), Neel tokens.
import '../globals.css'
import Link from 'next/link'
import { GUIDES, referencePages, STARTER_URL } from '@/domains/storefront-api/docs'
import { CURRENT_API_VERSION } from '@/domains/storefront-api/versions'
import { DocsNav } from './nav'
import { Monogram } from '@/components/brand/monogram'

/**
 * The Storefront API's docs (SA1b D·9; approved mockup § Docs): static pages on the API host only (api.frrata.shop/docs,
 * owner 2026-11-15), reached through apiRewrites; this internal path is a 404 on every other host (routeFor). No
 * database, no cookie, nothing per visitor.
 */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const ref = referencePages()
  const groups = [
    { label: 'Guides', items: GUIDES.map((g) => ({ href: g.slug === 'start' ? '/docs' : `/docs/${g.slug}`, label: g.title, code: false })) },
    { label: 'Reference', items: ref.map((r) => ({ href: `/docs/reference/${r.slug}`, label: r.title, code: true })) },
  ]
  return (
    <div data-neel="" className="min-h-dvh bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-3.5 border-b border-border px-5 py-3 max-md:px-4">
        <Monogram size={28} />
        <Link href="/docs" className="font-semibold"><span className="max-md:hidden">Frrata </span>Storefront API</Link>
        <span className="rounded-md border border-border px-1.5 font-mono text-small text-muted-foreground max-md:hidden">{CURRENT_API_VERSION}</span>
        <span className="flex-1" />
        <nav aria-label="Files" className="flex gap-3.5 text-sm text-muted-foreground max-md:hidden">
          <a href={`/${CURRENT_API_VERSION}/openapi.json`}>OpenAPI</a><a href={STARTER_URL}>Starter</a><a href="/llms.txt">llms.txt</a>
        </nav>
        <DocsNav groups={groups} phone />
      </header>
      <div className="grid md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="border-r border-border bg-side px-3 py-4 max-md:hidden"><DocsNav groups={groups} /></aside>
        <main className="grid max-w-[860px] content-start gap-4 px-9 py-7 max-md:px-4 max-md:py-4">{children}</main>
      </div>
    </div>
  )
}
