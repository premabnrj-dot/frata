'use client'

import { CardLink } from '@/components/layout/card-link'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/icons/icon'
import { FILTERS, homeState, passes, type OfferFilter } from '@/domains/modules/offer'
import type { Group, ModuleKey } from '@/domains/modules/registry'
import { AppTile } from './tile'

export type AppCard = {
  key: ModuleKey; name: string; job: string; group: Group; href: string
  footer: string; locked: boolean; state: { label: string; tone: 'ok' | 'warn' | 'neutral' | 'info' } | null; filter: OfferFilter; mine: boolean
}

/** The gallery (approved mockup 2026-11-11): your apps, search, filters with counts, and a card per app by job group. */
export function AppsGallery({ cards, groups, featured }: { cards: AppCard[]; groups: { key: Group; label: string }[]; featured?: React.ReactNode }) {
  const [filter, setFilter] = useState<OfferFilter | 'all'>('all')
  const [q, setQ] = useState('')
  const mine = cards.filter((c) => c.mine)
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([f]) => [f, f === 'all' ? cards.length : cards.filter((c) => c.filter === f).length])), [cards])
  const needle = q.trim().toLowerCase()
  const shown = cards.filter((c) => passes(c, filter) && (!needle || `${c.name} ${c.job}`.toLowerCase().includes(needle)))
  return (
    <div className="space-y-6">
      {mine.length ? (
        <section aria-labelledby="mine" className="space-y-2">
          <h2 id="mine" className="flex justify-between text-sm font-semibold text-muted-foreground"><span>Your apps</span><span className="font-normal">{mine.length} on</span></h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((c) => (
              <li key={c.key}>
                <CardLink href={c.href} className="flex items-center gap-3 rounded-lg p-3">
                  <AppTile k={c.key} />
                  <span className="min-w-0 flex-1"><span className="block font-semibold">{c.name}</span><span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span aria-hidden="true" className={`size-1.5 rounded-full ${c.state?.tone === 'warn' ? 'bg-warn-mark' : 'bg-ok-mark'}`} />{c.state?.label ?? homeState().label}</span></span>
                  <Icon name="chevron" className="size-4 text-muted-foreground" />
                </CardLink>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {featured}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-card px-3 sm:max-w-xs md:h-9">
          <Icon name="search" className="size-4 shrink-0 text-muted-foreground" />
          <span className="sr-only">Search apps</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search apps" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </label>
        <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
          {FILTERS.filter(([f]) => f === 'all' || counts[f]).map(([f, label]) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
              className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium ${filter === f ? 'border-foreground bg-foreground text-background' : 'border-border bg-card'}`}>
              {label}<span className="font-mono text-xs opacity-75">{counts[f]}</span>
            </button>
          ))}
        </div>
      </div>

      {shown.length ? groups.map((g) => {
        const list = shown.filter((c) => c.group === g.key)
        if (!list.length) return null
        return (
          <section key={g.key} aria-labelledby={`g-${g.key}`} className="space-y-2">
            <h2 id={`g-${g.key}`} className="flex justify-between text-sm font-semibold text-muted-foreground"><span>{g.label}</span><span className="font-normal">{list.length}</span></h2>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((c) => (
                <li key={c.key}>
                  <CardLink href={c.href} className={`flex h-full flex-col gap-3 rounded-xl p-4 ${c.filter === 'next' ? 'bg-background' : ''}`}>
                    <span className="flex items-start gap-3">
                      <AppTile k={c.key} />
                      <span className="min-w-0"><span className="block font-semibold">{c.name}</span><span className="text-xs text-muted-foreground">By Frrata</span></span>
                    </span>
                    <span className="text-sm text-muted-foreground">{c.job}</span>
                    <span className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3 text-sm">
                      {c.locked ? <span className="inline-flex items-center gap-1 text-muted-foreground"><Icon name="lock" className="size-3.5" />{c.footer}</span> : <span className="font-mono">{c.footer}</span>}
                      {c.state ? <Badge tone={c.state.tone}>{c.state.label}</Badge> : null}
                    </span>
                  </CardLink>
                </li>
              ))}
            </ul>
          </section>
        )
      }) : (
        <p className="text-sm text-muted-foreground">No app matches that search. <Button variant="ghost" onClick={() => { setQ(''); setFilter('all') }}>Clear search</Button></p>
      )}
    </div>
  )
}
