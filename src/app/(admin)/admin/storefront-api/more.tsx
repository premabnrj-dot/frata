'use client'

import { Menu } from '@/components/ui/menu'
import { MoreHorizontal } from 'lucide-react'

/** A store's More menu (links only; the Admin redraw's rule: rarely used actions in More). */
export function MoreLinks({ label, items }: { label: string; items: { label: string; href: string }[] }) {
  return <Menu label={label} items={items} variant="ghost" size="sm" chevron={false} icon={<MoreHorizontal aria-hidden="true" className="size-4" />} />
}
