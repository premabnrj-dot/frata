import { notFound } from 'next/navigation'
import { referencePages } from '@/domains/storefront-api/docs'
import { Get, rich, Table } from '../../blocks'

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
      <Get path={`${r.path}${r.example}`} />
      {r.header.length ? <Table head={['Header', 'Notes']} rows={r.header.map((f) => [f.name, f.note])} /> : null}
      {r.query.length ? <Table head={['Query', 'Values']} rows={r.query.map((f) => [f.name, f.note || f.type])} /> : null}
      {/* On a phone the type sits under the field's name, so the table fits the width (mockup § Docs phone). */}
      <div className="overflow-x-auto"><table className="w-full border-collapse text-sm">
        <thead><tr className="[&>th]:bg-sunk [&>th]:px-2.5 [&>th]:py-2 [&>th]:text-left [&>th]:text-small [&>th]:font-medium [&>th]:text-muted-foreground"><th scope="col">Field</th><th scope="col" className="max-md:hidden">Type</th><th scope="col">Notes</th></tr></thead>
        <tbody>{r.fields.map((f) => <tr key={f.name} className="border-t border-line-soft [&>td]:px-2.5 [&>td]:py-2 [&>td]:align-top">
          <td className="font-mono text-small md:whitespace-nowrap max-md:[overflow-wrap:anywhere]">{f.name}<span className="block font-sans text-muted-foreground md:hidden">{f.type}</span></td>
          <td className="max-md:hidden">{f.type}</td><td>{rich(f.note)}</td></tr>)}</tbody>
      </table></div>
      <h2 className="mt-2 text-lg font-semibold">Errors</h2>
      <Table head={['Answer', 'When']} rows={r.errors.map(([c, d]) => [c, d])} />
    </>
  )
}
