'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * Admin's frame: dark ink with a STAFF tag, so no one mistakes Admin for a
 * store's console (frata-design-language § Frata Admin). Always links to the
 * staffer's own store console when they have one.
 */
const ITEMS = [
  { href: '/admin/merchants', label: 'Merchants' },
  { href: '/admin/plans', label: 'Plans' },
  { href: '/admin/staff', label: 'Staff' },
  { href: '/admin/activity', label: 'Activity' },
]

export function AdminNav({ email, ownStore }: { email: string; ownStore: string | null }) {
  const path = usePathname()
  return (
    <nav aria-label="Admin" data-surface="ink" className="flex flex-col gap-1 bg-primary px-3 py-4 text-primary-foreground md:w-56 md:shrink-0">
      <div className="flex items-center gap-2 px-2 pb-4">
        <span className="text-sm font-bold">Frata Admin</span>
        <span className="rounded-sm bg-warn px-1.5 text-[11px] font-semibold text-warn-text">STAFF</span>
      </div>
      <div className="flex gap-1 overflow-x-auto md:flex-col">
        {ITEMS.map((i) => {
          const on = path === i.href || path.startsWith(`${i.href}/`)
          return (
            <Link key={i.href} href={i.href} aria-current={on ? 'page' : undefined}
              className={`whitespace-nowrap rounded-md px-2 py-1.5 text-sm ${on ? 'bg-primary-foreground/15 font-medium' : 'opacity-85 hover:bg-primary-foreground/10'}`}>
              {i.label}
            </Link>
          )
        })}
      </div>
      <div className="mt-auto hidden flex-col gap-1 border-t border-primary-foreground/20 pt-3 md:flex">
        {ownStore && (
          <>
            <span className="px-2 text-xs opacity-70">Your store</span>
            <Link href="/console" className="rounded-md px-2 py-1.5 text-sm hover:bg-primary-foreground/10">{ownStore} console</Link>
          </>
        )}
        <span className="px-2 pt-1 font-mono text-xs opacity-70">{email}</span>
      </div>
    </nav>
  )
}
