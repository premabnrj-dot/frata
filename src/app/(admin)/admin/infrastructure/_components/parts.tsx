import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import type { Alert } from '@/domains/infra/alerts'

// Shared pieces of Admin › Infrastructure (mockup docs/mockups/2026-11-10-infra-usage.html).

export const bytes = (b: number) => b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : b >= 1024 ** 2 ? `${Math.round(b / 1024 ** 2)} MB` : `${Math.round(b / 1024)} KB`

/** A row of facts across the top of a tab. */
export function Kpis({ items }: { items: { label: string; value: ReactNode; sub?: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border lg:grid-cols-4">
      {items.map((k) => (
        <div key={k.label} className="grid min-w-0 gap-0.5 bg-card p-3">
          <dt className="text-xs text-muted-foreground">{k.label}</dt>
          <dd className="font-num text-lg font-semibold tabular-nums">{k.value}</dd>
          {k.sub ? <dd className="text-xs text-muted-foreground">{k.sub}</dd> : null}
        </div>
      ))}
    </dl>
  )
}

/** What needs staff now or soon, first on the tab (Neel N4: Needs you first, the rest folded); nothing when nothing does. */
export function NeedsYou({ alerts }: { alerts: Alert[] }) {
  if (!alerts.length) return null
  return (
    <section aria-label="Needs you" className="rounded-mid border border-border bg-warn">
      <h2 className="px-4 pt-3 text-sm font-semibold">Needs you</h2>
      <ul className="divide-y divide-line-soft">
        {alerts.map((a) => (
          <li key={a.key} className="flex items-start gap-3 px-4 py-3">
            <Badge tone={a.level === 'now' ? 'danger' : 'warn'}>{a.level === 'now' ? 'Now' : 'Soon'}</Badge>
            <p className="min-w-0 text-sm"><b className="font-medium">{a.title}</b> <span className="text-muted-foreground">{a.why}</span></p>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** A folded part of a tab: its name and Show; opened, the table or list (Neel N4, board Infrastructure). */
export function Fold({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-lg border border-border bg-card">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-medium md:min-h-10 [&::-webkit-details-marker]:hidden">
        {title}<span className="text-muted-foreground group-open:hidden">Show</span><span className="hidden text-muted-foreground group-open:inline">Hide</span>
      </summary>
      <div className="border-t border-border p-4">{children}</div>
    </details>
  )
}

/** A labelled bar against a limit. */
export function Meter({ label, value, share, tone = 'neutral' }: { label: string; value: ReactNode; share: number; tone?: 'neutral' | 'warn' | 'danger' }) {
  const fill = tone === 'danger' ? 'bg-danger-text' : tone === 'warn' ? 'bg-warn-text' : 'bg-foreground'
  return (
    <div className="grid gap-1">
      <div className="flex justify-between gap-2 text-sm"><span>{label}</span><span className="font-num">{value}</span></div>
      <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-muted"><span className={`block h-full origin-left rounded-full ${fill}`} style={{ transform: `scaleX(${Math.max(0, Math.min(1, share))})` }} /></div>
    </div>
  )
}

/** The rules a tab watches (fixed in code; per-rule switches cut as YAGNI). */
export function Rules({ rules }: { rules: [string, string][] }) {
  return (
    <Fold title="Alert rules">
      <ul className="divide-y divide-line-soft px-4">
        {rules.map(([t, d]) => <li key={t} className="py-2"><p className="text-sm font-medium">{t}</p><p className="text-sm text-muted-foreground">{d}</p></li>)}
      </ul>
    </Fold>
  )
}

/** Where a tab's numbers come from, and how fresh they are. */
export function Sources({ items }: { items: string[] }) {
  return <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">{items.map((s) => <span key={s}>{s}</span>)}</p>
}
