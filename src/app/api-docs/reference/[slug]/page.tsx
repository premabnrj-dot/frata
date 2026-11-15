import { notFound } from 'next/navigation'
import { referencePages } from '@/domains/storefront-api/docs'
import { Table } from '../../blocks'

export const dynamic = 'force-static'
export const dynamicParams = false
export const generateStaticParams = () => referencePages().map((r) => ({ slug: r.slug }))
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const want = (await params).slug
  const r = referencePages().find((x) => x.slug === want)
  return { title: `Storefront API · ${r?.title ?? 'Reference'}` }
}

/** One path, generated from the published description (mockup § Docs: products/{handle}). */
export default async function Reference({ params }: { params: Promise<{ slug: string }> }) {
  const want = (await params).slug
  const r = referencePages().find((x) => x.slug === want) ?? notFound()
  return (
    <>
      <h1 className="font-mono text-[22px] leading-[30px] font-semibold">{r.title}</h1>
      <div className="flex min-w-0 flex-wrap items-center gap-2.5 rounded-md border border-border bg-sunk px-3 py-2.5 font-mono text-small [overflow-wrap:anywhere]">
        <span className="rounded bg-ok px-1.5 font-semibold text-ok-text">GET</span><span className="min-w-0">{r.path}</span>
      </div>
      {r.header.length ? <Table head={['Header', 'Notes']} rows={r.header.map((f) => [f.name, f.note])} /> : null}
      {r.query.length ? <Table head={['Query', 'Values']} rows={r.query.map((f) => [f.name, f.note || f.type])} /> : null}
      <Table head={['Field', 'Type', 'Notes']} rows={r.fields.map((f) => [f.name, f.type, f.note])} />
      <h2 className="mt-2 text-lg font-semibold">Errors</h2>
      <Table head={['Answer', 'When']} rows={r.errors.map(([c, d]) => [c, d])} />
    </>
  )
}
