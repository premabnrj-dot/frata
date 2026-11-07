import { Search, X } from 'lucide-react'
import Link from 'next/link'

/**
 * One search box for a list (Console and Admin): a GET form, so the search is in the address and the server
 * filters (§ Console patterns). `clearHref` shows a way back to the whole list while a search is on.
 */
export function SearchField({ name = 'q', label, placeholder, value, clearHref, hidden }: {
  name?: string; label: string; placeholder: string; value?: string; clearHref?: string; hidden?: Record<string, string>
}) {
  return (
    <form role="search" className="flex min-w-0 flex-1 items-center gap-2">
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <label htmlFor={`search-${name}`} className="sr-only">{label}</label>
      <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-card px-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring md:h-9 md:max-w-md">
        <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <input id={`search-${name}`} name={name} type="search" defaultValue={value} placeholder={placeholder} className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none" />
        {value && clearHref && <Link href={clearHref} aria-label="Clear search" className="inline-grid size-6 place-items-center rounded-sm text-muted-foreground hover:text-foreground"><X aria-hidden="true" className="size-4" /></Link>}
      </div>
    </form>
  )
}
