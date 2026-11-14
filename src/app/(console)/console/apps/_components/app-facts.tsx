import { Badge } from '@/components/ui/badge'
import type { Offer } from '@/domains/modules/offer'
import { MODULES, type ModuleKey } from '@/domains/modules/registry'
import { SHOWCASE } from '@/domains/modules/showcase'

/**
 * An app's facts, one component for its page's side column and its home's Usage and billing tab (Apps A2): the price
 * box (with the app's button only where `action` is given — never on the home: Turn off lives at its foot), Works with,
 * What it uses, Billed by others.
 */
export function AppFacts({ k, offer, worksWith, action, priceClass = '' }: {
  k: ModuleKey; offer: Offer; worksWith: { key: ModuleKey; name: string; on: boolean }[]; action?: React.ReactNode; priceClass?: string
}) {
  const def = MODULES[k], show = SHOWCASE[k]
  return (
    <>
      <div className={`rounded-xl border border-border bg-card p-4 ${priceClass}`}>
        <p className="text-xs font-semibold tracking-wide text-muted-foreground">PRICE</p>
        <p className="mt-1 font-num text-xl font-semibold">{offer.price}</p>
        {offer.action.kind === 'ask' ? <p className="mt-1 text-xs text-muted-foreground">On your Frrata bill · stop any time</p> : null}
        {offer.state ? <p className="mt-2"><Badge tone={offer.state.tone}>{offer.state.label}</Badge></p> : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
      {worksWith.length ? (
        <div className="rounded-xl border border-border bg-card p-4 text-sm">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">WORKS WITH</p>
          <ul className="space-y-1.5">{worksWith.map((w) => <li key={w.key} className="flex items-center justify-between"><span>{w.name}</span><Badge tone={w.on ? 'ok' : 'neutral'}>{w.on ? 'On' : 'Off'}</Badge></li>)}</ul>
        </div>
      ) : null}
      <div className="rounded-xl border border-border bg-card p-4 text-sm">
        <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">WHAT IT USES</p>
        <ul className="list-disc space-y-1 pl-4">{show.uses.map((u) => <li key={u}>{u}</li>)}</ul>
      </div>
      {def.usage ? (
        <div className="rounded-xl border border-border bg-card p-4 text-sm">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">BILLED BY OTHERS</p>
          <p className="text-muted-foreground">{def.usage}</p>
        </div>
      ) : null}
    </>
  )
}
