import { button } from '@/components/ui/button'
import { switchStoreAction } from '@/app/choose/actions'

/** "Open Studio" on a client (mockup docs/mockups/2026-11-24-open-studio-button.html, owner 2026-11-24). A server-drawn
 *  form, no script: it posts the store the person already holds and the one allowed destination to switchStoreAction,
 *  which picks among their own stores itself. The page draws it only for a store `studioStoreIds()` names. */
export function OpenStudio({ tenantId, size }: { tenantId: string; size?: 'sm' }) {
  return (
    <form action={switchStoreAction} className="inline">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="to" value="/partner/studio" />
      <button type="submit" className={button({ variant: 'secondary', size, className: 'whitespace-nowrap' })}>Open Studio</button>
    </form>
  )
}
