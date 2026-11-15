import Link from 'next/link'

// One row of choices that are links (a bill to look at, a view, an invoice filter): the address keeps the choice. The
// picked one in the selection colours (neel 50 and 800, Neel § Components); 44 px on a phone, 30 from md.
export function BillPicks({ label, items }: { label: string; items: { href: string; label: string; current: boolean }[] }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={i.current ? 'page' : undefined}
          className={`inline-flex min-h-11 items-center rounded-full border px-3 text-label font-medium md:min-h-7.5 ${i.current ? 'border-transparent bg-select text-select-foreground' : 'border-border bg-card hover:bg-accent'}`}>{i.label}</Link>
      ))}
    </nav>
  )
}
