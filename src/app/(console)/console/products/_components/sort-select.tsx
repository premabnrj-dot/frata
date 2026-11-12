'use client'

import { useRouter } from 'next/navigation'
import type { ListSort } from '@/domains/catalogue/list-query'

const LABELS: Record<ListSort, string> = { edited: 'Recently edited', name: 'Name', stock: 'Lowest stock' }

/** The list's sort: a choice that goes to its own address (the server sorts), so Back and a shared link keep it. */
export function SortSelect({ value, hrefs }: { value: ListSort; hrefs: Record<ListSort, string> }) {
  const router = useRouter()
  return (
    <span className="flex items-center gap-2">
      <label htmlFor="product-sort" className="sr-only text-sm text-muted-foreground md:not-sr-only">Sort</label>
      <select id="product-sort" value={value} onChange={(e) => router.push(hrefs[e.target.value as ListSort])}
        className="h-10 rounded-md border border-input bg-card px-2 text-sm md:h-9">
        {(Object.keys(LABELS) as ListSort[]).map((k) => <option key={k} value={k}>{LABELS[k]}</option>)}
      </select>
    </span>
  )
}
