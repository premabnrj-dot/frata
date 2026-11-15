'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Section } from '@/components/layout/section'
import { Badge, Tag } from '@/components/ui/badge'
import { Banner } from '@/components/ui/banner'
import { Button, button } from '@/components/ui/button'
import { CopyField } from '@/components/ui/copy-field'
import { Dialog } from '@/components/ui/dialog'
import { FIELD } from '@/components/ui/field'
import { FieldError, fieldProps } from '@/components/ui/field-error'
import { useToast } from '@/components/ui/toast-context'
import { SaveBar, useLeaveGuard } from '@/components/ui/unsaved'
import { createKeyAction, deleteKeyAction, setWebsiteAction } from './actions'

// =============================================================================
// Settings › Website, the parts a person works (mockup https://claude.ai/artifact/P8rsPfrY53V7Ezq1e4cnVm, as drawn):
// Website (where it runs, its address from a connected domain, one save), Checkout (read only), Keys (Create, the key
// shown once, Delete), For developers (the published description). A new key reaches this file only in the create
// action's reply and lives in this component's state until the dialog closes: never a URL, a toast or a later render.
// =============================================================================

export type KeyView = { id: string; name: string; prefix: string; chip: string; live: boolean; isPublic: boolean; line: string[] }
type Choice = { domainId: string; www: boolean }
type Option = Choice & { label: string }

// The chosen card keeps its frame when read only (design-system review 5); arrow keys move between the two (radio pattern).
const radio = (on: boolean, off?: boolean) =>
  `flex items-start gap-3 rounded-lg border p-3 text-left transition-[border-color,box-shadow] duration-fast ease-standard focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${on ? 'border-foreground ring-1 ring-foreground' : 'border-border'} ${off ? 'cursor-default bg-sunk text-muted-foreground' : on ? '' : 'hover:border-input'}`
const dot = (on: boolean) => `mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-foreground' : 'border-input'}`
const arrows = (pick: () => void) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
  e.preventDefault()
  const other = [...(e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? [])].find((x) => x !== e.currentTarget)
  other?.focus(); other?.click(); void pick
}

function RadioCard({ on, disabled, onPick, title, note }: { on: boolean; disabled?: boolean; onPick: () => void; title: string; note: string }) {
  return (
    <button type="button" role="radio" aria-checked={on} aria-disabled={disabled || undefined} tabIndex={on ? 0 : -1} onKeyDown={arrows(onPick)} onClick={disabled ? undefined : onPick} className={radio(on, disabled)}>
      <span aria-hidden="true" className={dot(on)}>{on ? <span className="size-2 rounded-full bg-foreground" /> : null}</span>
      <span><span className="block text-sm font-medium">{title}</span><span className="block text-xs text-muted-foreground">{note}</span></span>
    </button>
  )
}

export function WebsiteView(p: {
  canManage: boolean; saved: Choice | null; options: Option[]; checkout: { host: string; razorpayOk: boolean; custom: boolean }
  keys: KeyView[]; liveCount: number; testAllowed: boolean; openapi: string | null; maxKeys: number
}) {
  const router = useRouter()
  const toast = useToast()
  const [elsewhere, setElsewhere] = useState(!!p.saved)
  const [choice, setChoice] = useState<Choice | null>(p.saved ?? (p.options[0] ? { domainId: p.options[0].domainId, www: p.options[0].www } : null))
  const [saving, setSaving] = useState(false)
  const [confirmFrrata, setConfirmFrrata] = useState(false)
  const same = (a: Choice | null, b: Choice | null) => !!a && !!b && a.domainId === b.domainId && a.www === b.www
  const dirty = elsewhere ? !p.saved || !same(choice, p.saved) : !!p.saved
  useLeaveGuard(dirty)

  const save = async () => {
    if (!elsewhere && p.saved && !confirmFrrata) { setConfirmFrrata(true); return }
    setSaving(true)
    const r = await setWebsiteAction(elsewhere && choice ? { runs: 'elsewhere', domainId: choice.domainId, www: choice.www } : { runs: 'frrata' })
    setSaving(false); setConfirmFrrata(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.ok('Saved')
    router.refresh()
  }
  const discard = () => { setElsewhere(!!p.saved); setChoice(p.saved ?? (p.options[0] ?? null)) }
  const value = choice ? `${choice.domainId}:${choice.www ? 'www' : 'apex'}` : ''

  return (
    <div className="max-w-215 space-y-3">
      {dirty && p.canManage ? <SaveBar onSave={save} onDiscard={discard} pending={saving} count={1} /> : null}

      <Section title="Website">
        <div role="radiogroup" aria-label="Where your website runs" className="grid gap-2 sm:grid-cols-2">
          <RadioCard on={!elsewhere} disabled={!p.canManage} onPick={() => setElsewhere(false)} title="Runs on Frrata" note="Designed in Look" />
          <RadioCard on={elsewhere} disabled={!p.canManage} onPick={() => setElsewhere(true)} title="Your own website" note="Built by your developer or partner" />
        </div>
        {elsewhere ? (
          <>
            <label className="block space-y-1.5">
              <span className="text-label font-medium">Website address</span>
              {p.options.length ? (
                <select className={`${FIELD} w-full font-mono text-small`} value={value} disabled={!p.canManage}
                  onChange={(e) => { const [id, w] = e.target.value.split(':'); setChoice({ domainId: id!, www: w === 'www' }) }}>
                  {p.options.map((o) => <option key={`${o.domainId}:${o.www}`} value={`${o.domainId}:${o.www ? 'www' : 'apex'}`}>{o.label}</option>)}
                </select>
              ) : (
                <select className={`${FIELD} w-full`} disabled><option>Connect a domain first</option></select>
              )}
            </label>
            {p.options.length ? (
              <Banner tone="warn" title="Show your legal name, address, customer care and grievance officer."><Badge tone="warn">From 1 Jan 2027</Badge></Banner>
            ) : (
              <div><Link href="/console/settings/web-address" className={button({ variant: 'secondary', size: 'sm' })}>Connect domain</Link></div>
            )}
          </>
        ) : null}
      </Section>

      {p.saved ? (
        <>
          <Section title="Checkout" action={p.checkout.custom && p.checkout.razorpayOk ? <Badge tone="ok">Approved by Razorpay</Badge> : undefined}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex min-w-0 flex-wrap items-center gap-2"><span className="font-mono text-small [overflow-wrap:anywhere]">{p.checkout.host}</span><Tag>Main</Tag></span>
              <span className="flex items-center gap-1">
                <CopyButton value={p.checkout.host} label="checkout address" />
                {p.canManage ? <Link href="/console/settings/web-address" className={button({ variant: 'secondary', size: 'sm' })}>Edit store address</Link> : null}
              </span>
            </div>
          </Section>
          <Keys {...p} />
          {p.openapi ? (
            <Section title="For developers">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0"><span className="font-medium">OpenAPI</span> <span className="font-mono text-small text-muted-foreground [overflow-wrap:anywhere]">{p.openapi.replace(/^https:\/\//, '')}</span></span>
                <CopyButton value={p.openapi} label="OpenAPI address" />
              </div>
            </Section>
          ) : null}
        </>
      ) : null}

      <Dialog open={confirmFrrata} onClose={() => setConfirmFrrata(false)} title="Run your website on Frrata?"
        actions={<><Button variant="secondary" data-autofocus onClick={() => setConfirmFrrata(false)}>Keep your own website</Button><Button busy={saving} onClick={save}>Run on Frrata</Button></>}>
        <p>Your developer’s website stops working within a minute.</p>
      </Dialog>
    </div>
  )
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <>
      <Button size="sm" variant="ghost" aria-label={`Copy ${label}`}
        onClick={async () => { try { await navigator.clipboard.writeText(value); setDone(true); window.setTimeout(() => setDone(false), 2000) } catch { /* the address is on screen to select */ } }}>
        {done ? '✓ Copied' : 'Copy'}
      </Button>
      <span role="status" className="sr-only">{done ? 'Copied' : ''}</span>
    </>
  )
}

function Keys(p: { canManage: boolean; keys: KeyView[]; liveCount: number; testAllowed: boolean; maxKeys: number }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('Website')
  const [kind, setKind] = useState<'public' | 'test'>('public')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [made, setMade] = useState<string | null>(null)
  const [del, setDel] = useState<KeyView | null>(null)
  const full = p.liveCount >= p.maxKeys

  const start = () => { setName('Website'); setKind('public'); setErr(null); setMade(null); setOpen(true) }
  const close = () => { setOpen(false); setMade(null); if (made) router.refresh() }
  const create = async () => {
    setBusy(true); setErr(null)
    const r = await createKeyAction({ name, kind })
    setBusy(false)
    if (!r.ok) {
      if (r.field === 'name') { setErr(r.error); return }
      setOpen(false)
      toast.error(r.error, { action: { label: 'Try again', run: () => { setOpen(true) } } })
      return
    }
    setMade(r.key)
  }
  const remove = async () => {
    if (!del) return
    setBusy(true)
    const r = await deleteKeyAction(del.id)
    setBusy(false)
    const n = del.name
    setDel(null)
    if (!r.ok) { toast.error(r.error); return }
    toast.ok(`Key “${n}” deleted`)
    router.refresh()
  }

  return (
    <Section title="Keys" action={p.canManage ? (
      <span className="flex items-center gap-2">
        {full ? <Badge tone="neutral" className="tabular-nums">{p.liveCount} of {p.maxKeys}</Badge> : null}
        <Button size="sm" onClick={start} reason={full ? 'Delete a key to make another.' : undefined}>Create key</Button>
      </span>) : undefined}>
      {p.keys.length === 0 ? <p className="text-muted-foreground">No keys yet</p> : (
        <ul className="divide-y divide-line-soft" data-list>
          {p.keys.map((k) => (
            <li key={k.id} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-3 first:pt-0 ${k.live ? '' : 'text-muted-foreground'}`}>
              <span className="flex min-w-0 flex-wrap items-center gap-2 font-medium">{k.name}<Badge tone={k.live && k.isPublic ? 'info' : 'neutral'}>{k.chip}</Badge></span>
              <span>{k.live && p.canManage ? <Button size="sm" variant="danger" onClick={() => setDel(k)}>Delete</Button> : null}</span>
              <span className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-muted-foreground">
                <span className="font-mono text-small">{k.prefix}</span>{k.line.map((l) => <span key={l}>{l}</span>)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onClose={close} title="Create key"
        actions={made
          ? <Button variant="secondary" data-autofocus onClick={close}>Done</Button>
          : <><Button variant="secondary" data-autofocus onClick={close}>Not now</Button><Button busy={busy} onClick={create}>Create key</Button></>}>
        {made ? (
          <div className="space-y-2.5 rounded-lg border-2 border-dashed border-input bg-sunk p-3.5">
            <p className="font-medium">Copy this key now. We show it once.</p>
            <CopyField value={made} label="key" />
          </div>
        ) : (
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <span className="flex justify-between text-label font-medium"><label htmlFor="key-name-input">Name</label><span id="key-name-count" className="font-normal text-muted-foreground tabular-nums">{name.length}/40</span></span>
              <input id="key-name-input" className={`${FIELD} w-full`} value={name} maxLength={40} onChange={(e) => { setName(e.target.value); setErr(null) }} {...fieldProps('key-name', err)} />
              <FieldError name="key-name" message={err} />
            </div>
            <div role="radiogroup" aria-label="Key type" className="grid gap-2 sm:grid-cols-2">
              <RadioCard on={kind === 'public'} onPick={() => setKind('public')} title="Live" note="For your live website" />
              <RadioCard on={kind === 'test'} disabled={!p.testAllowed} onPick={() => setKind('test')} title="Test"
                note={p.testAllowed ? 'Ends when the store opens · 30 days at most' : 'Only before the store opens'} />
            </div>
          </div>
        )}
      </Dialog>

      <Dialog open={!!del} onClose={() => setDel(null)} title={del ? `Delete the key “${del.name}”?` : ''}
        actions={<><Button variant="secondary" data-autofocus onClick={() => setDel(null)}>Keep key</Button><Button variant="destructive" busy={busy} onClick={remove}>Delete key</Button></>}>
        <p>Websites using it stop working within a minute. This can’t be undone.</p>
      </Dialog>
    </Section>
  )
}
