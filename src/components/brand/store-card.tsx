import './store-card.css'

/**
 * THE STORE CARD: a store drawing itself — its address with the live dot, its name, a hero painted by the first thing
 * it sells, three tiles, and "Opening soon" or "Open". Sign-up's preview (O1·8) and Home's setup sketch (O2a·7) read
 * this one card (mockup § 1 `.store`, § 2 `.mini .store`). Decorative: its caller hides it from assistive tech; the
 * name and the address are only ever text.
 */
export function StoreCard({ host, name, sell, open = false, flat = false }: { host: string; name: string; sell: string | null; open?: boolean; flat?: boolean }) {
  return (
    <div className="su-store" data-store-card="" data-sell={sell ?? undefined} data-open={open ? '' : undefined} data-flat={flat ? '' : undefined}>
      <div className="su-store-url">{host}</div>
      <div className="su-store-nm">{name.trim()}</div>
      <div className="su-store-hero" />
      <div className="su-store-g"><i /><i /><i /></div>
      <div className="su-store-soon">{open ? 'Open' : 'Opening soon'}</div>
    </div>
  )
}
