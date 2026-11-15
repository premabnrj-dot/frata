import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Banner } from '@/components/ui/banner'
import { isModuleKey, MODULE_KEYS, MODULES } from '@/domains/modules/registry'
import { paise } from '@/domains/money/paise'
import { formatInr } from '@/lib/format'
import { PlanCalculator } from './plan-calculator'
import { KeepPlan, PlanButton, type PlanOption } from '../plan-choice'
import { pct } from './overview'

export type CataloguePlan = { code: string; name: string; monthlyPrice: number; feeBps: number; features: string[] }

/** Plans (mockup § Plans): which plan costs least at your sales, what each includes, the move; apps on your bill. */
export function Plans({ plans, current, custom, options, downgradeOn, scheduled, fromFeatured, mine, prices, on, readOnly }: {
  plans: CataloguePlan[]; current: string | null; custom: boolean; options: PlanOption[]; downgradeOn: string
  scheduled: { name: string; on: string; byShop: boolean } | null; fromFeatured: boolean; mine: number | null
  prices: Partial<Record<string, number>>; on: string[]; readOnly: boolean
}) {
  const included = (p: CataloguePlan, k: string) => p.features.includes(k)
  // Every app a plan can carry, core first; a cell is a tick (in the plan), a price (an add-on it may take) or a dash.
  const keys = MODULE_KEYS.filter((k) => MODULES[k].status === 'now' || plans.some((p) => included(p, k)))
  const cell = (p: CataloguePlan, k: (typeof MODULE_KEYS)[number]) => {
    const m = MODULES[k]
    if (m.billing === 'core' || included(p, k)) return 'yes'
    if (m.billing === 'add_on' && (!m.addOnFor || m.addOnFor.includes(p.code as never)) && prices[k] !== undefined) return `${formatInr(paise(prices[k]!))} a month`
    return null
  }
  const cur = plans.find((p) => p.code === current)
  const apps = keys.filter((k) => MODULES[k].billing === 'add_on' && isModuleKey(k))
  return (
    <div className="space-y-4">
      <Section title="Which plan costs least">
        <PlanCalculator plans={plans} mine={mine} />
      </Section>

      <Section ariaLabel="Plans">
        {scheduled ? (
          <Banner tone="info" className="mb-3" title={`Moving to ${scheduled.name} on ${scheduled.on}`} action={scheduled.byShop && !readOnly ? <KeepPlan current={cur?.name ?? 'my plan'} /> : undefined} />
        ) : null}
        {/* A comparison keeps its columns on a phone (it scrolls sideways in its box): reflowed, the plans lose their names. */}
        <div className="overflow-x-auto rounded-lg border border-border">
        <table aria-label="Plans side by side" className="w-full min-w-[640px] text-sm [&_button]:whitespace-nowrap">
          <thead className="border-b border-border bg-sunk text-left text-small text-muted-foreground">
            <tr>
            <th className="w-1/3 px-3 py-2 font-medium">Feature</th>
            {plans.map((p) => (
              <th key={p.code} className={`px-3 align-top font-medium ${p.code === current ? 'bg-select' : ''}`}>
                <span className="flex flex-col items-start gap-1 py-2 text-foreground">
                  <span className="flex items-center gap-1.5"><b className="text-section font-semibold">{p.name}</b>{p.code === current ? <Badge tone="info">Your plan</Badge> : null}</span>
                  <span><b className="font-num text-title font-semibold">{formatInr(paise(p.monthlyPrice))}</b><span className="font-normal text-muted-foreground"> a month</span></span>
                  <span className="font-normal">+ {pct(p.feeBps)} of delivered sales</span>
                </span>
              </th>
            ))}
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k} className="border-b border-line-soft [&>td]:h-11 [&>td]:px-3">
                <td>{MODULES[k].name}</td>
                {plans.map((p) => { const c = cell(p, k); return (
                  <td key={p.code} className={p.code === current ? 'bg-select' : ''}>
                    {c === 'yes' ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-ok-text" role="img" aria-label="Included"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                      : <span className="text-label text-muted-foreground">{c ?? '—'}</span>}
                  </td>) })}
              </tr>
            ))}
            {!readOnly && !custom ? (
              <tr className="[&>td]:px-3 [&>td]:py-3">
                <td />
                {plans.map((p) => { const o = options.find((x) => x.code === p.code); return (
                  <td key={p.code} className={p.code === current ? 'bg-select' : ''}>{o ? <PlanButton option={o} current={cur?.name ?? 'my plan'} downgradeOn={downgradeOn} fromFeatured={fromFeatured} scheduled={!!scheduled} /> : null}</td>) })}
              </tr>
            ) : null}
          </tbody>
        </table>
        </div>
        {custom ? <p className="mt-3 text-label text-muted-foreground">Price agreed with Frrata</p> : null}
      </Section>

      <Section title="Apps on your bill">
        <ul>
          {apps.map((k) => {
            const inPlan = !!cur && included(cur, k), isOn = on.includes(k)
            return (
              <li key={k} className="flex flex-wrap items-center justify-between gap-2.5 border-t border-line-soft py-3 first:border-0">
                <span className="flex flex-col"><span className="font-medium">{MODULES[k].name}</span><span className="text-label text-muted-foreground">{MODULES[k].job}</span></span>
                <span className="flex items-center gap-3">
                  <Badge tone={inPlan || isOn ? 'ok' : 'neutral'}>{inPlan ? `In ${cur!.name}` : isOn ? 'On' : 'Off'}</Badge>
                  <span className="min-w-26 text-right font-num">{inPlan ? '₹0' : prices[k] !== undefined ? `${formatInr(paise(prices[k]!))} a month` : '—'}</span>
                </span>
              </li>
            )
          })}
        </ul>
      </Section>
    </div>
  )
}
