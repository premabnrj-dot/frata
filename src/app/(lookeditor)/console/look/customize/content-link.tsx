import { Icon } from '@/components/icons/icon'

/** Where a Look panel was: one row that opens Console › Content (V1: the bar, menus, the Contact line and pages are the
 *  store's content, saved live there). A full page load: the console is another route group. */
export function ContentLink({ tab, title, sub }: { tab: 'announcement' | 'menus' | 'pages' | 'faq' | 'contact'; title: string; sub: string | null }) {
  return (
    <a href={`/console/content?tab=${tab}`} className="flex min-h-12 items-center gap-3 rounded-lg border border-border bg-card p-3 text-sm hover:border-input">
      <span className="min-w-0"><b className="block font-medium">{title}</b>{sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}</span>
      <span className="ml-auto shrink-0 font-medium">Edit in Content</span><Icon name="chevron" className="size-4 shrink-0 text-muted-foreground" />
    </a>
  )
}
