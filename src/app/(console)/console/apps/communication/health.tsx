'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Icon } from '@/components/icons/icon'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Button, button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Menu } from '@/components/ui/menu'
import { limitWords, qualityWords, WA_MANAGER, type Need } from '@/domains/communication/health'
import { checkWhatsAppAction, disconnectWhatsAppAction } from './actions'

// The connected number (C1 · mockup Health): who it is, its health in words, and what it needs from you.

type View = { displayPhone: string; verifiedName: string | null; coexistence: boolean; quality: string | null; limitTier: string | null; historySync: boolean; checked: string | null }
const TONE = { danger: 'danger', warn: 'warn', info: 'info' } as const

export function NumberHealth({ c, needs, canManage }: { c: View; needs: Need[]; canManage: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const run = (f: () => Promise<{ ok: boolean; error?: string }>) => start(async () => {
    setError(null)
    const r = await f()
    if (!r.ok) { setError(r.error ?? 'Something went wrong.'); return }
    setConfirm(false); router.refresh()
  })
  const limit = limitWords(c.limitTier)
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <Section>
        <div className="flex flex-wrap items-center gap-4" data-tinge>
          <span aria-hidden="true" className="inline-grid size-12 place-items-center rounded-lg bg-muted"><Icon name="messages" className="size-7" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-base font-semibold">{c.displayPhone}</p>
            <p className="text-sm text-muted-foreground">{c.verifiedName ?? 'Name not set'} · {c.coexistence ? 'WhatsApp Business app and Frrata' : 'Frrata only'}</p>
          </div>
          {canManage ? <Menu items={[{ label: 'Check again', onSelect: () => run(checkWhatsAppAction) }, { label: 'Disconnect', onSelect: () => setConfirm(true), danger: true }]} /> : null}
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-muted-foreground">Quality</dt><dd className="font-semibold">{qualityWords(c.quality)}</dd></div>
          <div><dt className="text-muted-foreground">Limit</dt><dd className="font-semibold">{limit ? <><span className="font-mono">{limit}</span> new chats a day</> : 'Not set yet'}</dd></div>
          {c.coexistence ? <div><dt className="text-muted-foreground">Chats from the app</dt><dd className="font-semibold">{c.historySync ? 'Last 6 months, coming across' : 'Not asked for'}</dd></div> : null}
        </dl>
        {c.checked ? <p className="mt-3 text-xs text-muted-foreground">Checked with Meta {c.checked}{pending ? ' · checking…' : ''}</p> : null}
      </Section>

      {needs.length ? (
        <Section title="Needs you" flush>
          <ul className="divide-y divide-border">
            {needs.map((n) => (
              <li key={n.key} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <Badge tone={TONE[n.tone]}>{n.badge}</Badge>
                <span className="min-w-[12rem] flex-1">{n.text}</span>
                {n.action === 'manager' ? <a href={WA_MANAGER} target="_blank" rel="noopener noreferrer" className={button()}>Open WhatsApp Manager</a> : null}
                {n.action === 'currency_help' ? <a href={WA_MANAGER} target="_blank" rel="noopener noreferrer">How</a> : null}
                {n.action === 'reconnect' && canManage ? <Button variant="secondary" onClick={() => setConfirm(true)}>Reconnect</Button> : null}
                {n.note ? <span className="text-xs text-muted-foreground">{n.note}</span> : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : <p className="text-sm text-muted-foreground">Nothing needs you. Order messages come next.</p>}
      {error && !confirm ? <p role="alert" className="text-sm text-danger-text">{error}</p> : null}

      <Dialog open={confirm} onClose={() => setConfirm(false)} title={`Disconnect ${c.displayPhone}?`}
        description="Frrata stops sending and receiving on this number. The number stays yours; connect it again any time."
        actions={<><Button variant="secondary" className="after:hidden" data-autofocus onClick={() => setConfirm(false)}>Keep it connected</Button><Button variant="destructive" disabled={pending} onClick={() => run(disconnectWhatsAppAction)}>Disconnect</Button></>}>
        {error ? <p role="alert" className="text-sm text-danger-text">{error}</p> : null}
      </Dialog>
    </div>
  )
}
