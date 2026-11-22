import { Money } from '@/components/data/numeric'
import { type Paise, paise } from '@/domains/money/paise'
import { Monogram } from './monogram'

// =============================================================================
// FILE: src/components/brand/console-preview.tsx — the partner workspace, drawn for /partners (website spec W·1).
//
// Example clients and the share each earns, marked "Example". Nothing in it is a link or a Tab stop. Every money
// figure is handed in from shareExample(), never typed here.
// =============================================================================

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
