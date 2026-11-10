'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Button, button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Icon } from '@/components/icons/icon'
import { MODULE_ICON } from '@/components/modules/icons'
import type { Offer } from '@/domains/modules/offer'
import type { Group, ModuleKey } from '@/domains/modules/registry'
import { setModuleAction } from './actions'
import { Switch } from '@/components/ui/switch'

export type AppRow = {
  key: ModuleKey; name: string; job: string; group: Group; features: string[]; usage: string | null
  worksWith: { name: string; on: boolean }[]; offer: Offer; ask: string; setup: string | null
}

const ICON = MODULE_ICON
const TONE = { ok: 'ok', info: 'info', neutral: 'neutral', warn: 'warn' } as const

function Tile({ k, size = 'md' }: { k: ModuleKey; size?: 'md' | 'lg' }) {
  // The rani tinge shows inside data-tinge only (brand rules): a tile is a brand surface, not a status.
  return <span aria-hidden="true" data-tinge className={`inline-grid shrink-0 place-items-center rounded-lg bg-muted ${size === 'lg' ? 'size-14' : 'size-12'}`}><Icon name={ICON[k] ?? 'apps'} className="size-7" /></span>
}


/** The rows, the details dialog (a sheet on phones) and the turn-off dialog. One action per app (offer.ts). */
export function AppsList({ groups, rows, canManage }: { groups: { key: Group; label: string }[]; rows: AppRow[]; canManage: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState<AppRow | null>(null)
  const [off, setOff] = useState<AppRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const toggle = (r: AppRow, on: boolean) => start(async () => {
    setError(null)
    const res = await setModuleAction({ module: r.key, on })
    if (!res.ok) { setError(res.error); return }
    setOff(null); setOpen(null); router.refresh()
  })
  const ask = (r: AppRow) => (on: boolean) => (on ? toggle(r, true) : setOff(r))
  const action = (r: AppRow, where: 'row' | 'dialog') => {
    const a = r.offer.action
    if (a.kind === 'switch' && r.setup && where === 'row') {
      return <span className="flex items-center gap-3"><Link href={r.setup} className={button({ variant: 'secondary' })}>Set up</Link>{canManage ? <Switch on={a.on} label={r.name} disabled={pending} onChange={() => ask(r)(!a.on)} /> : null}</span>
    }
    if (a.kind === 'switch') return canManage ? <Switch on={a.on} label={r.name} disabled={pending} onChange={() => ask(r)(!a.on)} /> : <span className="text-sm text-muted-foreground">{a.on ? 'On' : 'Off'}</span>
    // On a phone the whole row opens the details (a chevron says so); the button is for a computer only.
    if (where === 'row') return <Button variant="secondary" className="hidden md:inline-flex" onClick={() => { setError(null); setOpen(r) }}>See details</Button>
    if (a.kind === 'ask') return <a href={r.ask} target="_blank" rel="noopener" className={button()}>{a.label}</a>
    if (a.kind === 'plans') return <Link href="/console/settings/billing" className={button()}>{a.label}</Link>
    return <Badge tone="neutral">Coming next</Badge>
  }
  return (
    <>
      {error && !open && !off ? <p role="alert" className="text-sm text-danger-text">{error}</p> : null}
      {groups.map((g) => {
        const list = rows.filter((r) => r.group === g.key)
        if (!list.length) return null
        return (
          <section key={g.key} aria-labelledby={`g-${g.key}`} className="space-y-2">
            <h2 id={`g-${g.key}`} className="text-section font-semibold">{g.label}</h2>
            <Section flush ariaLabel={g.label}>
              <ul className="divide-y divide-border">
                {list.map((r) => (
                  <li key={r.key} className="relative flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                    <Tile k={r.key} />
                    <div className="min-w-[11rem] flex-1">
                      {/* The name opens the details; on a phone its hit area is the whole row (switches and links sit above it). */}
                      <button type="button" onClick={() => { setError(null); setOpen(r) }} className="text-left font-semibold underline-offset-2 hover:underline max-md:after:absolute max-md:after:inset-0 max-md:after:content-['']">{r.name}</button>
                      <p className="text-sm text-muted-foreground">{r.job}</p>
                    </div>
                    <span className="flex items-center gap-2"><Badge tone={TONE[r.offer.tone]}>{r.offer.badge}</Badge>{r.offer.action.kind !== 'switch' ? <Icon name="chevron" className="size-4 text-muted-foreground md:hidden" /> : null}</span>
                    {r.usage ? <span className="hidden text-xs text-muted-foreground md:inline">{r.usage}</span> : null}
                    {r.offer.action.kind === 'switch' || r.setup ? <span className="relative z-10 flex items-center">{action(r, 'row')}</span> : <span className="relative z-10 hidden md:flex">{action(r, 'row')}</span>}
                  </li>
                ))}
              </ul>
            </Section>
          </section>
        )
      })}

      <Dialog open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ''} className="md:w-[min(44rem,calc(100vw-2rem))]"
        description={open?.job}
        actions={open ? <><Button variant="secondary" data-autofocus onClick={() => setOpen(null)}>Not now</Button>{action(open, 'dialog')}</> : null}>
        {open ? (
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_15rem]">
            <div className="space-y-3">
              <Tile k={open.key} size="lg" />
              <h3 className="text-sm font-semibold">What you get</h3>
              <ul className="space-y-2 text-sm">{open.features.map((f) => <li key={f} className="flex gap-2"><span aria-hidden="true" className="text-ok-text">✓</span>{f}</li>)}</ul>
              {open.worksWith.length ? (
                <p className="text-sm">Works with {open.worksWith.map((w) => <span key={w.name} className="ml-1 inline-flex items-center gap-1">{w.name}<Badge tone={w.on ? 'ok' : 'neutral'}>{w.on ? 'On' : 'Off'}</Badge></span>)}</p>
              ) : null}
            </div>
            <div className="space-y-2 rounded-lg bg-muted p-4 text-sm">
              <Badge tone={TONE[open.offer.tone]}>{open.offer.badge}</Badge>
              <p className="font-mono text-base font-semibold">{open.offer.price}</p>
              {open.offer.action.kind === 'ask' ? <p className="text-muted-foreground">On your monthly Frrata bill · stop any time</p> : null}
              {open.usage ? <p className="text-muted-foreground">{open.usage}</p> : null}
            </div>
            {error ? <p role="alert" className="text-sm text-danger-text md:col-span-2">{error}</p> : null}
          </div>
        ) : null}
      </Dialog>

      <Dialog open={!!off} onClose={() => setOff(null)} title={off ? `Turn off ${off.name}?` : ''}
        description={off ? <ul className="list-disc space-y-1 pl-5"><li>{off.name} stops for your shop.</li><li>Anything it had queued is cancelled.</li><li>What it made stays. Turn it back on any time.</li></ul> : null}
        actions={off ? <><Button variant="secondary" data-autofocus onClick={() => setOff(null)}>Keep {off.name}</Button><Button variant="destructive" disabled={pending} onClick={() => toggle(off, false)}>Turn off {off.name}</Button></> : null}>
        {error && off ? <p role="alert" className="text-sm text-danger-text">{error}</p> : null}
      </Dialog>
    </>
  )
}
