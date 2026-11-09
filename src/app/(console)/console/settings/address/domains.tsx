'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Button, button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Toaster, useToast } from '@/components/ui/toast'
import { tidyDomain } from '@/domains/addresses/domain-input'
import { DOMAIN_CHIP, type DomainState } from '@/domains/addresses/domain-state'
import type { Record3 } from '@/lib/domains/own-domains'
import { checkDomainAction, connectDomainAction, domainRecordsAction, makeMainAction, razorpayOkAction, removeDomainAction, undoMainAction, type Connected } from './domain-actions'

// =============================================================================
// FILE: settings/address/domains.tsx — OWN DOMAINS (D2·10; mockup v2 https://claude.ai/artifact/XrDQj61tSBe4YKvUrH76xt,
// design rules 72–76). One Addresses list; Connect is a Dialog (a sheet on a phone) of three steps that checks by
// itself every 15 s while open and visible, waiting for each answer, for 20 minutes at most; Make main works like
// Publish (one-line confirm, the 1.3 s Going-live line, then a toast with Undo). Rows change in place; nothing animates
// in a list. Words: Rule 0 — labels, values, chips and the fix.
// =============================================================================

export type DomainView = { id: string; host: string; www: string | null; state: DomainState; razorpayOk: boolean }

const RAZORPAY = 'https://dashboard.razorpay.com/app/website-app-settings'
const POLL_MS = 15_000
const POLL_FOR_MS = 20 * 60_000
type Step = 1 | 2 | 3
type Found = 'yes' | 'no' | 'unknown'

export function Domains(props: { nameHost: string; slug: string; rows: DomainView[]; livePayments: boolean; available: boolean; canManage: boolean }) {
  return <Toaster><DomainsInner {...props} /></Toaster>
}

function DomainsInner({ nameHost, slug, rows, livePayments, available, canManage }: { nameHost: string; slug: string; rows: DomainView[]; livePayments: boolean; available: boolean; canManage: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [, start] = useTransition()
  const [open, setOpen] = useState<null | { resume?: string }>(null)
  const [confirm, setConfirm] = useState<DomainView | null>(null)
  const [remove, setRemove] = useState<DomainView | null>(null)
  const [going, setGoing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const live = rows.filter((r) => r.state !== 'moved' && r.state !== 'disconnected')
  const main = rows.find((r) => r.state === 'main' || r.state === 'not_working')
  const full = live.reduce((n, r) => n + 1 + (r.www ? 1 : 0), 0) >= 4

  const act = (id: string, run: () => Promise<{ ok: boolean; error?: string }>, ok?: string) => {
    setBusy(id)
    start(async () => {
      const r = await run().catch(() => ({ ok: false, error: 'We could not change it. Nothing was changed.' }))
      setBusy(null)
      if (!r.ok) toast({ text: r.error ?? 'We could not change it. Nothing was changed.' })
      else { if (ok) toast({ text: ok }); router.refresh() }
    })
  }

  const makeMain = (d: DomainView) => {
    setConfirm(null)
    setGoing(true)
    const began = Date.now() // clock-ok: in a handler or timer, never at render
    start(async () => {
      const r = await makeMainAction(d.id, slug).catch(() => ({ ok: false as const, error: 'We could not change it. Nothing was changed.' }))
      await new Promise((res) => setTimeout(res, Math.max(0, 1300 - (Date.now() - began)))) // clock-ok: in a handler or timer, never at render
      setGoing(false)
      if (!r.ok) { toast({ text: r.error }); return }
      router.refresh()
      toast({ text: `${d.host} is your main address`, undo: async () => { const u = await undoMainAction(slug); router.refresh(); return u } })
    })
  }

  return (
    <Section title="Addresses" action={canManage && available && <Button variant={live.length ? 'secondary' : 'primary'} disabled={full} onClick={() => setOpen({})}>Connect a domain</Button>} flush>
      {going && <div aria-hidden className="h-0.5 w-full origin-left animate-going-live bg-thread" />}
      <ul className="divide-y divide-border">
        <Row host={nameHost} chip={main ? null : { tone: 'neutral', words: 'Main' }}>
          <CopyOpen host={nameHost} />
        </Row>
        {rows.map((d) => {
          const c = DOMAIN_CHIP[d.state]
          const needsRzp = livePayments && d.state === 'connected' && !d.razorpayOk
          return (
            <Row key={d.id} host={d.host} chip={c} extra={needsRzp ? <Badge tone="warn">Razorpay not approved</Badge> : null}
              line={d.state === 'not_working' ? `Shoppers go to ${nameHost}` : null}>
              {canManage && (d.state === 'waiting' || d.state === 'held' || d.state === 'other_account') && <Button size="wrap" variant="secondary" onClick={() => setOpen({ resume: d.id })}>Continue</Button>}
              {canManage && (d.state === 'securing' || d.state === 'not_working') && <Button size="wrap" variant="secondary" disabled={busy === d.id} onClick={() => act(d.id, () => checkDomainAction(d.id).then((r) => (r.ok ? { ok: true } : r)))}>Check now</Button>}
              {canManage && needsRzp && <a className={button({ variant: 'secondary', size: 'wrap' })} href={RAZORPAY} target="_blank" rel="noopener noreferrer">Open Razorpay</a>}
              {canManage && needsRzp && <Button size="wrap" variant="secondary" disabled={busy === d.id} onClick={() => act(d.id, () => razorpayOkAction(d.id, true), 'Saved')}>Razorpay approved it</Button>}
              {canManage && d.state === 'connected' && !needsRzp && <Button size="wrap" variant="secondary" onClick={() => setConfirm(d)}>Make main</Button>}
              {(d.state === 'main' || d.state === 'connected') && <CopyOpen host={d.host} />}
              {canManage && d.state !== 'main' && d.state !== 'moved' && d.state !== 'disconnected' && <Button size="wrap" variant="ghost" onClick={() => setRemove(d)}>Remove</Button>}
            </Row>
          )
        })}
      </ul>
      {open && <Connect resume={open.resume} onClose={() => { setOpen(null); router.refresh() }} />}
      <Dialog open={!!confirm} onClose={() => setConfirm(null)} title={`Make ${confirm?.host ?? ''} your main address?`} description="Bags in progress start empty."
        actions={<><Button variant="secondary" data-autofocus onClick={() => setConfirm(null)}>Keep {main?.host ?? nameHost}</Button><Button onClick={() => confirm && makeMain(confirm)}>Make it main</Button></>} />
      <Dialog open={!!remove} onClose={() => setRemove(null)} title={`Remove ${remove?.host ?? ''}?`}
        actions={<><Button variant="secondary" data-autofocus onClick={() => setRemove(null)}>Keep it</Button><Button variant="destructive" onClick={() => { const d = remove!; setRemove(null); act(d.id, () => removeDomainAction(d.id, slug), 'Removed') }}>Remove {remove?.host ?? ''}</Button></>} />
    </Section>
  )
}

function Row({ host, chip, extra, line, children }: { host: string; chip: { tone: 'ok' | 'warn' | 'danger' | 'info' | 'neutral'; words: string } | null; extra?: React.ReactNode; line?: string | null; children?: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5">
      <span className="flex min-w-0 flex-wrap items-center gap-2 font-mono text-sm [overflow-wrap:anywhere]">{host}{chip && <Badge tone={chip.tone}>{chip.words}</Badge>}{extra}</span>
      <span className="flex flex-wrap justify-end gap-1.5">{children}</span>
      {line && <span className="col-span-2 text-xs text-danger-text">{line}</span>}
    </li>
  )
}

function CopyOpen({ host }: { host: string }) {
  const toast = useToast()
  return (
    <>
      <Button size="wrap" variant="ghost" onClick={() => { void navigator.clipboard?.writeText(`https://${host}`).then(() => toast({ text: 'Copied' }), () => {}) }}>Copy</Button>
      <a className={button({ variant: 'ghost', size: 'wrap' })} href={`https://${host}`} target="_blank" rel="noopener noreferrer">Open</a>
    </>
  )
}

const recordsText = (host: string, records: Record3[]) => [host, ...records.map((r) => `${r.type}  ${r.name}  ${r.value}`)].join('\n')

/** The three steps (rule 73): Domain · Records · Securing. Resumes at Records for a claimed row. */
function Connect({ resume, onClose }: { resume?: string; onClose: () => void }) {
  const toast = useToast()
  const [step, setStep] = useState<Step>(resume ? 2 : 1)
  const [back, setBack] = useState(false)
  const [raw, setRaw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [claim, setClaim] = useState<Connected | null>(null)
  const [found, setFound] = useState<Found[]>([])
  const [checked, setChecked] = useState<string>('Checking every 15 s')
  const [secure, setSecure] = useState(0)
  const [pending, start] = useTransition()
  const stopAt = useRef(0) // set when checking starts (never read at render)
  const go = (s: Step) => { setBack(s < step); setStep(s) }

  useEffect(() => {
    if (!resume) return
    start(async () => { const r = await domainRecordsAction(resume); if (r.ok) setClaim(r); else setError(r.error) })
  }, [resume])

  const tidy = tidyDomain(raw)
  const shown = tidy.startsWith('www.') ? tidy.slice(4) : tidy

  const poll = useCallback(async () => {
    if (!claim) return 'stop' as const
    const r = await checkDomainAction(claim.id).catch(() => null)
    if (!r || !r.ok) return 'again' as const
    const c = r.check
    if (c.state === 'busy') return 'again' as const
    setChecked('Checked just now')
    setFound([c.found.txt, c.found.points, ...(c.found.www === null ? [] : [c.found.www])])
    if (c.state === 'securing') { setSecure((v) => Math.min(0.9, v + 0.35)); if (step !== 3) go(3) }
    if (c.state === 'connected') { setSecure(1); if (step !== 3) go(3); return 'stop' as const }
    if (c.state === 'dispute' || c.state === 'held') setError('In use by another shop')
    if (c.state === 'paused') setError('Checking paused')
    return 'again' as const
  }, [claim, step]) // eslint-disable-line react-hooks/exhaustive-deps

  // Waits for each answer; pauses while the tab is hidden; stops at Connected or after 20 minutes.
  useEffect(() => {
    if (!claim || step === 1) return
    let alive = true, timer: ReturnType<typeof setTimeout> | null = null
    if (!stopAt.current) stopAt.current = Date.now() + POLL_FOR_MS // clock-ok: in an effect, never at render
    const tick = async () => {
      if (!alive) return
      if (document.hidden) { timer = setTimeout(tick, POLL_MS); return }
      if (Date.now() > stopAt.current) { setChecked('Checking stopped · Check now'); return } // clock-ok: in a handler or timer, never at render
      const next = await poll()
      if (alive && next === 'again') timer = setTimeout(tick, POLL_MS)
    }
    timer = setTimeout(tick, 800)
    return () => { alive = false; if (timer) clearTimeout(timer) }
  }, [claim, poll, step])

  const connect = () => start(async () => {
    setError(null)
    const r = await connectDomainAction(raw).catch(() => ({ ok: false as const, error: 'We could not connect it. Nothing was changed.' }))
    if (!r.ok) { setError(r.error); return }
    setClaim(r); stopAt.current = Date.now() + POLL_FOR_MS; go(2) // clock-ok: in a handler or timer, never at render
  })
  const copy = (text: string, what = 'Copied') => { void navigator.clipboard?.writeText(text).then(() => toast({ text: what }), () => {}) }
  const done = found.filter((f) => f === 'yes').length

  const footer = step === 1
    ? <><Button variant="secondary" data-autofocus onClick={onClose}>Not now</Button><Button disabled={!shown || pending} onClick={connect}>Continue</Button></>
    : step === 2
      ? <Button variant="secondary" data-autofocus onClick={onClose}>Finish later</Button>
      : <Button variant="secondary" data-autofocus onClick={onClose}>{secure >= 1 ? 'Done' : 'Close'}</Button>

  return (
    <Dialog open onClose={onClose} title="Connect a domain" actions={footer} className="sm:max-w-lg">
      <div className="mb-3 flex gap-1.5" aria-hidden>{[1, 2, 3].map((n) => <span key={n} className={`h-0.5 w-6 rounded-full transition-colors duration-base ease-standard ${n <= step ? 'bg-foreground' : 'bg-border'}`} />)}</div>
      <div key={step} className={back ? 'animate-step-back' : 'animate-step-forward'}>
        {step === 1 && (
          <div className="grid gap-2">
            <label className="grid gap-1 text-sm font-medium" htmlFor="domain">Domain
              <input id="domain" value={raw} onChange={(e) => { setRaw(e.target.value); setError(null) }} autoComplete="off" spellCheck={false} placeholder="yourbrand.in" maxLength={300}
                className="h-10 rounded-md border border-input bg-card px-3 font-mono text-sm md:h-9" onKeyDown={(e) => { if (e.key === 'Enter' && shown) connect() }} />
            </label>
            {shown && shown !== raw.trim() && !error && <p className="font-mono text-xs text-muted-foreground">{shown}</p>}
            {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
          </div>
        )}
        {step === 2 && (
          <div className="grid gap-3">
            {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone={claim && done === claim.records.length ? 'ok' : 'neutral'}>{claim ? `${done} of ${claim.records.length} found` : '…'}</Badge>
              <span role="status" className="text-xs text-muted-foreground">{checked}</span>
            </div>
            <ul className="divide-y divide-border rounded-md border border-border">
              {claim?.records.map((r, i) => (
                <li key={`${r.type}${r.name}`} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-3 py-2 text-xs">
                  <span className="font-mono font-semibold text-muted-foreground">{r.type}</span>
                  <span className="grid min-w-0 gap-0.5 font-mono [overflow-wrap:anywhere]"><span>{r.name}</span><span>{r.value}</span></span>
                  <Button size="wrap" variant="secondary" onClick={() => copy(r.value)}>Copy</Button>
                  <span className="col-start-2 col-end-4">{found[i] === 'yes' ? <Badge tone="ok">Found</Badge> : <Badge tone="neutral">Not found yet</Badge>}</span>
                </li>
              ))}
            </ul>
            {claim && (
              <div className="flex flex-wrap gap-1.5">
                {claim.dns && <a className={button({ variant: 'secondary', size: 'wrap' })} href={claim.dns.url} target="_blank" rel="noopener noreferrer">Open {claim.dns.name} DNS</a>}
                <Button size="wrap" variant="secondary" onClick={() => copy(recordsText(claim.host, claim.records), 'Copied 3 records')}>Copy all</Button>
                <a className={button({ variant: 'secondary', size: 'wrap' })} href={`https://wa.me/?text=${encodeURIComponent(recordsText(claim.host, claim.records))}`} target="_blank" rel="noopener noreferrer">Send on WhatsApp</a>
                <Button size="wrap" variant="ghost" disabled={pending} onClick={() => { stopAt.current = Date.now() + POLL_FOR_MS; start(async () => { await poll() }) }}>Check now</Button> // clock-ok: in a handler or timer, never at render
              </div>
            )}
          </div>
        )}
        {step === 3 && (
          <div className="grid gap-3">
            {secure < 1 ? (
              <>
                <div className="flex justify-between gap-2 text-sm"><b>Securing</b><span className="font-mono text-muted-foreground">{claim?.host}</span></div>
                <div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full origin-left bg-foreground transition-transform duration-slow ease-standard" style={{ transform: `scaleX(${secure})` }} /></div>
              </>
            ) : (
              <div className="grid justify-items-center gap-2 py-2 text-center">
                <span className="font-mono font-semibold">{claim?.host}</span>
                <Badge tone="ok">Connected</Badge>
                <a className={button({ variant: 'secondary', size: 'wrap' })} href={RAZORPAY} target="_blank" rel="noopener noreferrer">Open Razorpay</a>
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}
