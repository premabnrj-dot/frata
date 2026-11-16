import { notFound } from 'next/navigation'
import { GUIDES } from '@/domains/storefront-api/docs'
import { Blocks } from '../blocks'

export const dynamic = 'force-static'
export const dynamicParams = false
export const generateStaticParams = () => GUIDES.filter((g) => g.slug !== 'start').map((g) => ({ guide: g.slug }))
export async function generateMetadata({ params }: { params: Promise<{ guide: string }> }) {
  const want = (await params).guide
  const g = GUIDES.find((x) => x.slug === want)
  return { title: `Storefront API · ${g?.title ?? 'Docs'}` }
}

/** A guide (mockup § Docs: Bag link). */
export default async function Guide({ params }: { params: Promise<{ guide: string }> }) {
  const want = (await params).guide
  const g = GUIDES.find((x) => x.slug === want && x.slug !== 'start') ?? notFound()
  return (
    <>
      <h1 className="text-[26px] leading-8 font-semibold tracking-tight">{g.title}</h1>
      <p className="max-w-[68ch] text-muted-foreground">{g.lead}</p>
      <Blocks body={g.body} />
    </>
  )
}
