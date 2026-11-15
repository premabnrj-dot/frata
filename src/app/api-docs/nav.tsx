'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu } from '@/components/ui/menu'
import { MoreHorizontal } from 'lucide-react'

type Group = { label: string; items: { href: string; label: string; code: boolean }[] }

/** The docs' guides and reference: a side list on a computer, a menu on a phone (mockup § Docs phone). */
export function DocsNav({ groups, phone = false }: { groups: Group[]; phone?: boolean }) {
  const path = usePathname()?.replace(/^\/api-docs/, '/docs') ?? ''
  if (phone) return <span className="md:hidden"><Menu label="Docs pages" size="sm" variant="ghost" chevron={false} icon={<MoreHorizontal aria-hidden="true" className="size-4" />}
    items={groups.flatMap((g) => g.items.map((i) => ({ label: i.label, href: i.href })))} /></span>
  return (
    <nav aria-label="Docs" className="grid gap-0.5 text-sm">
      {groups.map((g) => (
        <div key={g.label} className="grid gap-0.5">
          <p className="mx-2 mt-3 mb-1 text-[11px] font-semibold tracking-[.06em] text-muted-foreground uppercase first:mt-0">{g.label}</p>
          {g.items.map((i) => (
            <Link key={i.href} href={i.href} aria-current={path === i.href ? 'page' : undefined}
              className={`rounded-md px-2 py-1.5 ${path === i.href ? 'border border-border bg-card font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent'}`}>
              {i.code ? <code className="font-mono text-small">{i.label}</code> : i.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  )
}
