import Link from 'next/link'

/**
 * The console's navigation, grouped by job (from Ekatan's sidebar). A row is
 * added when its page exists — never a link to "coming soon".
 * Phone first: a top bar under 768px, a sidebar above. Frata staff also see a
 * link to Admin (frata-design-language § Frata Admin).
 */
const GROUPS: { label: string; items: { href: string; label: string }[] }[] = [
  { label: 'Today', items: [{ href: '/console', label: 'Home' }, { href: '/console/orders', label: 'Orders' }] },
  { label: 'Store', items: [{ href: '/console/activity', label: 'Activity' }] },
]

export function ConsoleNav({ storeName, isStaff }: { storeName: string; isStaff: boolean }) {
  return (
    <nav className="flex flex-col border-b border-border bg-card md:w-56 md:shrink-0 md:border-r md:border-b-0">
      <div className="flex items-center gap-2 px-4 py-3">
        <span className="text-sm font-semibold text-brand">Frata</span>
        <span className="truncate text-sm text-muted-foreground">{storeName}</span>
      </div>
      <div className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-4">
        {GROUPS.map((g) => (
          <div key={g.label} className="flex gap-1 md:flex-col">
            <p className="hidden px-2 pt-2 text-xs font-medium text-muted-foreground md:block">{g.label}</p>
            {g.items.map((i) => (
              <Link key={i.href} href={i.href} className="rounded-md px-2 py-1.5 text-sm whitespace-nowrap hover:bg-accent">
                {i.label}
              </Link>
            ))}
          </div>
        ))}
        {isStaff && (
          <Link href="/admin" className="rounded-md px-2 py-1.5 text-sm font-medium whitespace-nowrap hover:bg-accent md:mt-auto md:border-t md:border-border md:pt-3">
            Frata Admin
          </Link>
        )}
      </div>
    </nav>
  )
}
