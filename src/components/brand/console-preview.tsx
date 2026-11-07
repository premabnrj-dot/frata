import { Money } from '@/components/data/numeric'
import { type Paise, paise } from '@/domains/money/paise'
import { EXAMPLE_COSTS, type ExampleOrder } from '@/domains/orders/example'
import { formatInr } from '@/lib/format'
import { Monogram } from './monogram'

// =============================================================================
// FILE: src/components/brand/console-preview.tsx — the console, drawn for the website's hero (website spec W·1).
//
// A picture of the real Today screen and one order, filled with the example shop's data and marked "Example
// shop", with a caption. Nothing in it is a link or a Tab stop. Every money figure is handed in from
// exampleOrder() (the profit engine), never typed here.
// =============================================================================

export function ConsolePreview({ order }: { order: ExampleOrder | null }) {
  return (
    <figure className="m-0 min-w-0 overflow-hidden rounded-xl border border-primary-foreground/15 bg-background text-foreground">
      <div className="flex items-center gap-2.5 border-b border-border bg-card px-3.5 py-2.5 text-sm">
        <Monogram size={24} /><b>Kesar Studio</b>
        <span className="ml-auto rounded-sm bg-muted px-1.5 py-0.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Example shop</span>
      </div>
      <div className="grid gap-3 p-4">
        <p className="font-display text-xl font-semibold tracking-tight">Today</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[['To confirm', '6', <span key="r" className="rounded-sm bg-danger px-1.5 text-danger-text">1 high risk</span>], ['To pack', '3', 'oldest 2 h'], ['On hold', '0', 'Nothing on hold']].map(([k, v, f], i) => (
            <div key={k as string} className={`grid gap-0.5 rounded-md border border-border bg-card px-3 py-2 ${i === 2 ? 'hidden sm:grid' : ''}`}>
              <span className="text-xs text-muted-foreground">{k}</span><span className="font-mono text-xl font-semibold">{v}</span><span className="truncate text-xs text-muted-foreground">{f}</span>
            </div>
          ))}
        </div>
        <div className="grid gap-2.5 rounded-lg border border-border bg-card p-3.5 text-sm">
          <div className="flex flex-wrap items-center gap-2"><b className="font-mono">KS-1043</b><span className="rounded-sm bg-warn px-1.5 text-xs text-warn-text">COD</span><span className="rounded-sm bg-ok px-1.5 text-xs text-ok-text">Low risk</span><span className="ml-auto text-xs text-muted-foreground">Indore 452018</span></div>
          <p className="text-xs text-muted-foreground">Linen kurta set · Indigo · M</p>
          {order && (
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
              <dt>To collect</dt><dd className="text-right"><Money paise={order.collect} /></dd>
              <dt>Frrata fee, if delivered</dt><dd className="text-right"><Money paise={order.fee} /></dd>
              <dt className="border-t border-border pt-1.5 font-semibold">You keep, if delivered <span className="ml-1 rounded-sm bg-info px-1 text-xs font-semibold text-info-text">Next</span></dt><dd className="border-t border-border pt-1.5 text-right font-semibold text-ok-text"><Money paise={order.ifDelivered} /></dd>
              <dt className="text-muted-foreground">If it comes back <span className="ml-1 rounded-sm bg-info px-1 text-xs font-semibold text-info-text">Next</span></dt><dd className="text-right"><Money paise={order.ifReturned} /></dd>
            </dl>
          )}
        </div>
      </div>
      <figcaption className="border-t border-border bg-card px-3.5 py-2 text-xs text-muted-foreground">Example shop. Kurta cost {formatInr(EXAMPLE_COSTS.cogs)}, shipping {formatInr(EXAMPLE_COSTS.forwardShipping)} each way, ads {formatInr(EXAMPLE_COSTS.adCost)}.</figcaption>
    </figure>
  )
}

/** A partner's workspace, drawn for /partners: example clients and the share each earns (from shareExample()). */
export function EarningsPreview({ share, brands }: { share: Paise; brands: string[] }) {
  return (
    <figure className="m-0 min-w-0 overflow-hidden rounded-xl border border-primary-foreground/15 bg-background text-foreground">
      <div className="flex items-center gap-2.5 border-b border-border bg-card px-3.5 py-2.5 text-sm">
        <Monogram size={24} /><b>Your clients</b>
        <span className="ml-auto rounded-sm bg-muted px-1.5 py-0.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Example</span>
      </div>
      <div className="grid gap-3 p-4">
        <div><span className="text-xs text-muted-foreground">Your share this month <span className="ml-1 rounded-sm bg-info px-1 font-semibold text-info-text">Next</span></span><p className="font-mono text-3xl font-semibold"><Money paise={paise(share * brands.length)} /></p></div>
        <table className="w-full text-sm"><tbody>
          {brands.map((b) => <tr key={b} className="border-t border-border"><td className="py-1.5">{b}</td><td className="py-1.5 text-right"><Money paise={share} decimals /></td></tr>)}
        </tbody></table>
      </div>
      <figcaption className="border-t border-border bg-card px-3.5 py-2 text-xs text-muted-foreground">Example · ex GST · paid monthly once Frrata billing starts.</figcaption>
    </figure>
  )
}
