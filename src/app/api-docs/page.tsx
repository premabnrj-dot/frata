import { GUIDES } from '@/domains/storefront-api/docs'
import { Blocks } from './blocks'

export const dynamic = 'force-static'
export const metadata = { title: 'Storefront API · Start' }

const STEPS = [['1 · Get a key', 'The brand creates it in Settings › Website.'], ['2 · Read the store', 'Products, collections, pages.'], ['3 · Send the bag', 'A link to the store’s checkout.']]

/** The docs' home: Start (mockup § Docs). */
export default function DocsStart() {
  const g = GUIDES[0]!
  return (
    <>
      <h1 className="text-[26px] leading-8 font-semibold tracking-tight">{g.title}</h1>
      <p className="max-w-[68ch] text-muted-foreground">{g.lead}</p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        {STEPS.map(([t, s]) => <div key={t} className="grid gap-1 rounded-xl border border-border bg-card px-4 py-3.5"><b className="font-semibold">{t}</b><span className="text-small text-muted-foreground">{s}</span></div>)}
      </div>
      <Blocks body={g.body.slice(0, 3)} />
    </>
  )
}
