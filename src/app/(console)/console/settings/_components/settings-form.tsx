'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { button } from '@/components/ui/button'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { InfoTip } from '@/components/ui/info-tip'
import { LeaveDialog, SaveBar, useLeaveGuard } from '@/components/ui/unsaved'
import { FieldError, errorId, useErrorSummary } from '@/components/ui/field-error'
import { useToast } from '@/components/ui/toast'
import {
  BrandPreview, CheckoutPreview, FooterPreview, InvoicePreview, type ShopFacts,
} from '@/components/shop-preview/previews'
import { STORE_FONT_VARS } from '@/components/shop-preview/fonts'
import { POLICY_PAGES, type PolicyPage } from '@/domains/policies/pages'
import { draftPatch, sectionFor, type Field, type Values } from '@/domains/settings/sections'
import { saveSection } from '../actions'
import { ShopLogo } from './shop-logo'
import { DocLogo } from './doc-logo'
import { UnratedNotice } from './unrated'
import type { Unrated } from '@/domains/tax/rates'
import { Section } from '@/components/layout/section'
import { ChipInput } from '@/components/ui/chip-input'
import { announce } from '@/components/shell/announce'
import { PINCODE_SHAPE } from '@/domains/signup/slug'
import type { PinSuggestion } from '@/domains/orders/pin-suggest'
import { CodPreview } from './cod-preview'
import { Switch } from '@/components/ui/switch'
import { STATES, STATE_CODE } from '@/domains/checkout/states'
import { Badge } from '@/components/ui/badge'
import { OWNER_ONLY_WORDS, type AskPage } from '@/domains/settings/owner-only'
import { LockedFacts } from './locked-facts'
import { AskOwner } from './ask-owner'
// Only the Policies section draws the five pages (their templates are the heaviest part of this page): loaded when shown.
// Store details only: the Pickup PIN code field and its city lookup (O1·5), kept out of every other page's first load.
const PincodeField = dynamic(() => import('./pincode-field').then((m) => m.PincodeField))
const PolicyPages = dynamic(() => import('./policy-pages').then((m) => m.PolicyPages))
const PolicyPreview = dynamic(() => import('@/components/shop-preview/policy-preview').then((m) => m.PolicyPreview))
const ContactPreview = dynamic(() => import('@/components/shop-preview/policy-preview').then((m) => m.ContactPreview))

/**
 * One settings page: the fields its section defines, ONE explicit save, an
 * "Unsaved changes" bar on the first edit, a guard on leaving, and the shop
 * beside it as shoppers will see it (frata-design-language § Phase 1).
 */
export function SettingsForm({ sectionKey, head, initial, version: startVersion, facts, fiscalYear, overrides, tenantId, unrated = null, held = [], suggest = null, lock = null, ask = null, place = null }: {
  sectionKey: string
  /** The page's head (Settings › group, title, the group's tabs): drawn by the server page. */
  head: React.ReactNode
  initial: Values
  version: number
  facts: ShopFacts
  fiscalYear: string
  overrides: Record<string, string>
  /** For an upload's path (Settings › Invoices and slips' logo). */
  tenantId: string
  /** Taxes: live products checkout refuses for want of a GST rate (null: the shop charges no GST). */
  unrated?: Unrated | null
  /** Fields another app sets now (Delivery Zones while usable): left out here, with one link to where they are set. */
  held?: readonly string[]
  /** Pay on delivery: one PIN code its returns suggest taking off (pin-suggest.ts), or none. */
  suggest?: PinSuggestion | null
  /** PP1 (src/domains/settings/owner-only.ts): this page locked whole, or these fields, for this person; drawn as facts. */
  lock?: { whole: true } | { whole: false; fields: readonly string[] } | null
  /** Ask the owner, where a block holds it (Contact's grievance officer); a whole page's sits in the header. */
  ask?: { page: AskPage; asked: boolean } | null
  /** Store details: the saved pickup PIN code's city and state, read with the page (O1·5). */
  place?: { city: string; state: string } | null
}) {
  const section = sectionFor(sectionKey)!
  const router = useRouter()
  const [saved, setSaved] = useState(initial)
  const [values, setValues] = useState(initial)
  const [version, setVersion] = useState(startVersion)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const toast = useToast()
  const formRef = useRef<HTMLFormElement>(null)
  // Field mistakes stay at their fields; one summary toast counts them and moves focus to the first (§ Feedback 3).
  const [attempt, setAttempt] = useState(0)
  useErrorSummary(errors, { attempt, scope: formRef })
  const [pending, start] = useTransition()
  const [policyPage, setPolicyPage] = useState<PolicyPage>('returns')
  // The save's own answer wins over the page's until the page is loaded again.
  const [unratedNow, setUnratedNow] = useState<Unrated | null | undefined>(undefined)

  const dirty = JSON.stringify(values) !== JSON.stringify(saved)
  const changes = Object.keys(values).filter((k) => JSON.stringify(values[k]) !== JSON.stringify(saved[k])).length
  // The suggested PIN code, once added here: recorded with the save that keeps it (saveSection's `took`).
  const [took, setTook] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  // Ctrl/⌘+S presses the save bar's own button, as in the product editor (the one path a save takes).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's' || e.altKey || e.shiftKey) return
      e.preventDefault()
      if (e.isComposing || document.querySelector('dialog:modal')) return
      root.current?.querySelector<HTMLButtonElement>('button[data-save-bar]:not(:disabled)')?.click()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const [mac, setMac] = useState(false)
  useEffect(() => { setMac(/Mac|iPhone|iPad/.test(navigator.platform)) }, [])
  const preview: ShopFacts = useMemo(() => {
    const p = draftPatch(section, values) as Partial<ShopFacts> & { name?: string }
    return { ...facts, ...p, shopName: typeof p.name === 'string' && p.name ? p.name : facts.shopName }
  }, [section, values, facts])

  const guard = useLeaveGuard(dirty)

  const set = (k: string, v: string | boolean) => { setValues((x) => ({ ...x, [k]: v })); setErrors((e) => { const { [k]: _, ...rest } = e; return rest }) }

  function save() {
    start(async () => {
      const r = await saveSection(section.key, values, version, took ?? undefined)
      if (r.ok) { setSaved(values); setVersion(r.version); setErrors({}); if (section.key === 'business') setUnratedNow(r.unrated ?? null); setTook(null); toast.ok(section.key === 'invoices' ? 'Saved. New slips and invoices use it. Invoices already issued keep theirs.' : 'Saved. Your store shows it now.'); router.refresh(); return }
      const fields = r.errors ?? {}
      setErrors(fields)
      if (Object.keys(fields).length) { setAttempt((a) => a + 1); return }
      // A conflict offers its one action: Reload (what is typed here is theirs to make again, the words say so). A save
      // from a tab opened before handover (PP1 screen 6) says nothing changed; Reload draws the page as it is now.
      const reload = { label: 'Reload', run: () => window.location.reload() }
      toast.error(r.error, r.locked ? { sub: OWNER_ONLY_WORDS.nothingChanged, action: reload } : r.conflict ? { action: reload } : undefined)
    })
  }

  const previewEl = section.preview === 'footer' ? <FooterPreview f={preview} />
    : section.preview === 'contact' ? <ContactPreview f={preview} />
    : section.preview === 'brand' ? <BrandPreview f={preview} />
    : section.key === 'payments' ? <CodPreview f={preview} />
    : section.preview === 'checkout' ? <CheckoutPreview f={preview} />
    : section.preview === 'invoice' ? <InvoicePreview f={preview} fiscalYear={fiscalYear} />
    : <PolicyPreview f={preview} page={policyPage} override={overrides[policyPage]} />

  return (
    <div ref={root} className={STORE_FONT_VARS}>
      {head}
      {section.key === 'business' && <UnratedNotice u={unratedNow !== undefined ? unratedNow : unrated} />}
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <form ref={formRef} className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); if (dirty) save() }}>
          {section.key === 'store' && <ShopLogo tenantId={tenantId} current={facts.logoUrl ?? null} />}
          {section.key === 'invoices' && <DocLogo tenantId={tenantId} current={facts.docLogo} />}
          {section.blocks.some((b) => b.fields.some((f) => held.includes(f.key))) && (
            <Section title="Set in Delivery Zones" action={<Link href="/console/apps/delivery_zones" className={button({ variant: 'secondary' })}>Open Delivery Zones</Link>} />
          )}
          {section.blocks.map((b) => ({ b, all: b.fields.filter((f) => !held.includes(f.key)).filter((f) => !f.showIf || f.showIf.in.includes(String(values[f.showIf.key] ?? ''))) })).filter(({ all }) => all.length).map(({ b, all }) => {
            // PP1: what this person may not change reads as facts; a block locked whole carries the chip (and Ask the
            // owner) beside its title, unless the whole page is locked (the header says it once).
            const locked = !lock ? [] : lock.whole ? all : all.filter((f) => lock.fields.includes(f.key))
            const shown = all.filter((f) => !locked.includes(f))
            const blockLocked = !!lock && !lock.whole && !shown.length
            const title = <h2 className={section.blocks.length === 1 && b.title === section.title ? 'sr-only' : 'flex items-center text-section font-semibold'}>{b.title}{b.tip ? <InfoTip about={b.title.toLowerCase()}>{b.tip}</InfoTip> : null}</h2>
            return (
            <Section key={b.title}>
              {/* A page of one block named as the page: its name is the page's, said to a screen reader only (Settings board). */}
              {blockLocked ? (
                // As drawn: the title, the chip and Ask the owner in a row; on a phone the chip takes the line under them.
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 md:flex-nowrap">
                  {title}
                  <span className="order-3 w-full md:order-none md:w-auto"><Badge>{OWNER_ONLY_WORDS.chip}</Badge></span>
                  {ask ? <span className="ml-auto shrink-0"><AskOwner page={ask.page} asked={ask.asked} size="sm" /></span> : null}
                </div>
              ) : title}
              {b.hint && <p className="-mt-1 text-sm text-muted-foreground">{b.hint}</p>}
              {/* The drawn frame: switch rows, then the short fields side by side (three when there are three), then the wide
                  ones, each group under a hairline. */}
              {runs(shown).map((run, i) => (
                <div key={i} className={`${i ? 'border-t border-line-soft pt-4 ' : ''}${run.kind === 'grid' ? `grid gap-3 sm:grid-cols-2 ${run.fields.length >= 3 ? 'lg:grid-cols-3' : ''}` : 'flex flex-col gap-3'}`}>
                  {run.fields.map((f) => f.kind === 'pincode' ? <PincodeField key={f.key} f={f} value={values[f.key]} error={errors[f.key]} onChange={(v) => set(f.key, v)} saved={String(saved[f.key] ?? '')} savedPlace={place} /> : <FieldInput key={f.key} f={f} value={values[f.key]} error={errors[f.key]} onChange={(v) => set(f.key, v)}
                    locked={f.key === 'b2bInvoices' && values.turnoverBand !== undefined && values.turnoverBand !== 'under_5cr' ? 'Off at ₹5 crore and above until e-invoicing is set up.' : undefined}
                    after={f.key === 'codBlockedPincodes' && suggest && !String(values.codBlockedPincodes ?? '').split(/[\s,]+/).includes(suggest.pin) ? (
                      <p className="text-label text-muted-foreground">From your returns: <button type="button" className="text-link underline underline-offset-2"
                        onClick={() => { const list = String(values.codBlockedPincodes ?? '').split(/[\s,]+/).filter(Boolean); set('codBlockedPincodes', [...list, suggest.pin].join(', ')); setTook(suggest.pin); announce(`Added ${suggest.pin}`); document.getElementById('f-codBlockedPincodes')?.focus() }}>add {suggest.pin}</button> ({suggest.back} of {suggest.outcomes} came back)</p>
                    ) : null} />)}
                </div>
              ))}
              {locked.length > 0 && (
                <div className={shown.length ? 'border-t border-line-soft pt-4' : undefined}>
                  <LockedFacts fields={locked} values={values} chip={shown.length > 0} />
                </div>
              )}
            </Section>
            )
          })}
          {section.key === 'policies' && <PolicyPages facts={preview} overrides={overrides} selected={policyPage} onSelect={setPolicyPage} pagesDirty={dirty} locked={!!lock?.whole} />}
          <button type="submit" hidden />
        </form>
        <aside className="lg:sticky lg:top-16">
          {previewEl}
          {section.key === 'policies' && (
            <div className="mt-2 flex flex-wrap gap-1" role="tablist" aria-label="Preview page">
              {POLICY_PAGES.map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={policyPage === k} onClick={() => setPolicyPage(k)}
                  className="rounded-full border border-border px-2.5 py-1 text-xs aria-selected:border-primary aria-selected:bg-primary aria-selected:text-primary-foreground">{label}</button>
              ))}
            </div>
          )}
        </aside>
      </div>

      {dirty && <SaveBar placement="bottom" keys={mac ? '⌘S' : 'Ctrl+S'} count={changes} pending={pending} onSave={save} onDiscard={() => { setValues(saved); setErrors({}); setTook(null) }} />}
      <LeaveDialog open={!!guard.leaveTo} what={section.title} onStay={guard.stay} onLeave={() => guard.leave(() => setSaved(values))} />
    </div>
  )
}

type Run = { kind: 'rows' | 'grid'; fields: Field[] }
/** Consecutive fields of a kind together: switches and wide fields as rows, the rest as a grid. */
function runs(fields: Field[]): Run[] {
  const out: Run[] = []
  for (const f of fields) {
    const kind = f.kind === 'switch' || f.wide ? 'rows' : 'grid'
    const last = out.at(-1)
    if (last && last.kind === kind && !(kind === 'rows' && (f.kind === 'switch') !== (last.fields[0]?.kind === 'switch'))) last.fields.push(f)
    else out.push({ kind, fields: [f] })
  }
  return out
}

/** "(optional)" only where a field can really be left empty; a dropdown or a number always holds a value. */
const CAN_BE_BLANK = new Set(['text', 'textarea', 'email', 'phone', 'gstin', 'pincodes'])

function FieldInput({ f, value, error, onChange, locked, after }: { f: Field; value: Values[string] | undefined; error?: string; onChange: (v: string | boolean) => void
  /** A line under the field (the PIN suggestion). */
  after?: React.ReactNode
  /** Held off for a reason another field gives (said under it). */
  locked?: string }) {
  const id = `f-${f.key}`
  const described = `${id}-h`
  const base = 'w-full rounded-md border border-input bg-card px-3 text-sm aria-invalid:border-danger-text'
  // Only an error or a limit/money/legal line is said under the field; detail is behind the (i). The error takes the
  // hint's place (its own <FieldError>, the mark and the words).
  const help = error ? <FieldError name={id} message={error} /> : f.hint ? <p id={described} className="text-xs text-muted-foreground">{f.hint}</p> : null
  const marks = { 'aria-invalid': !!error || undefined, 'aria-describedby': error ? errorId(id) : f.hint ? described : undefined }
  const tip = f.tip ? <InfoTip about={f.label.toLowerCase()}>{f.tip}</InfoTip> : null
  if (f.kind === 'switch') {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <span className="flex flex-col"><span className="flex items-center"><label htmlFor={id} className="text-sm font-medium">{f.label}</label>{tip}</span>{f.hint ? <span className="text-label text-muted-foreground">{f.hint}</span> : null}</span>
          <Switch id={id} on={!locked && value === true} disabled={!!locked} onChange={(v) => onChange(v)} />
        </div>
        {locked && <p className="text-xs text-muted-foreground">{locked}</p>}
      </div>
    )
  }
  if (f.kind === 'radio') {
    return (
      <fieldset className="space-y-1.5 sm:col-span-2">
        <legend className="sr-only">{f.label}</legend>
        <div role="radiogroup" aria-label={f.label} {...marks} tabIndex={error ? -1 : undefined} className="grid gap-2 sm:grid-cols-3">
          {f.options!.map(([o, l]) => {
            const on = value === o
            return (
              <button key={o} id={on ? id : undefined} type="button" role="radio" aria-checked={on} onClick={() => onChange(o)}
                className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-[border-color,box-shadow] duration-fast ${on ? 'border-foreground shadow-[inset_0_0_0_1px_var(--color-foreground)]' : 'border-border hover:border-input'}`}>
                <span aria-hidden="true" className={`mt-0.5 size-4 shrink-0 rounded-full border-2 ${on ? 'border-[5px] border-foreground' : 'border-input'}`} />
                <span><span className="block text-sm font-medium">{l}</span>{f.notes?.[o] && <span className="block text-xs text-muted-foreground">{f.notes[o]}</span>}</span>
              </button>
            )
          })}
        </div>
        {help}
      </fieldset>
    )
  }
  if (f.kind === 'segmented') {
    return (
      <div className={`space-y-1 ${f.wide ? 'sm:col-span-2' : ''}`}>
        <div className="flex items-center"><span id={`${id}-l`} className="text-sm font-medium">{f.label}</span>{tip}</div>
        <div role="radiogroup" aria-labelledby={`${id}-l`} {...marks} tabIndex={error ? -1 : undefined} className="inline-flex max-w-full flex-wrap gap-0.5 rounded-lg bg-muted p-0.5">
          {f.options!.map(([o, l]) => (
            <button key={o} id={value === o ? id : undefined} type="button" role="radio" aria-checked={value === o} onClick={() => onChange(o)}
              className={`min-h-9 rounded-md px-3 text-sm font-medium transition-[background-color,color] duration-fast ${value === o ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{l}</button>
          ))}
        </div>
        {help}
      </div>
    )
  }
  const common = { id, ...marks }
  const v = typeof value === 'string' ? value : ''
  let input: React.ReactNode
  if (f.kind === 'pincodes') {
    const list = v.split(/[\s,]+/).filter(Boolean)
    return (
      <div className="space-y-2">
        <div className="flex items-center"><label htmlFor={id} className="text-sm font-medium">{f.label}</label>{tip}</div>
        <ChipInput id={id} values={list} onChange={(next) => onChange(next.join(', '))} bad={(p) => !PINCODE_SHAPE.test(p)}
          describedBy={marks['aria-describedby']} invalid={!!error} />
        {help}
        {after}
      </div>
    )
  }
  if (f.kind === 'textarea') input = <textarea {...common} rows={3} maxLength={f.max} value={v} onChange={(e) => onChange(e.target.value)} className={`${base} py-2`} />
  else if (f.kind === 'state') input = <select {...common} value={v} onChange={(e) => onChange(e.target.value)} className={`${base} h-11 md:h-9`}><option value="">Choose</option>{STATES.map((st) => <option key={st} value={STATE_CODE[st]}>{st}</option>)}</select>
  else if (f.kind === 'select') input = <select {...common} value={v} onChange={(e) => onChange(e.target.value)} className={`${base} h-11 md:h-9`}>{f.options!.map(([o, l]) => <option key={o} value={o}>{l}</option>)}</select>
  else {
    const numeric = f.kind === 'rupees' || f.kind === 'days' || f.kind === 'hsn'
    input = (
      <div className="flex items-center gap-1.5">
        {/* A rupee field's label ends ", ₹" (Settings board): no second ₹ beside the box. */}
        {f.kind === 'phone' && <span className="text-sm text-muted-foreground">+91</span>}
        <input {...common} value={v} maxLength={f.max} onChange={(e) => onChange(e.target.value)}
          type={f.kind === 'email' ? 'email' : 'text'} inputMode={numeric ? 'numeric' : f.kind === 'phone' ? 'tel' : f.kind === 'email' ? 'email' : undefined}
          autoCapitalize={f.kind === 'gstin' ? 'characters' : undefined}
          className={`${base} h-11 md:h-9 ${f.kind === 'gstin' ? 'font-mono' : numeric || f.kind === 'phone' ? 'font-num' : ''}`} />
      </div>
    )
  }
  return (
    <div className={`space-y-1 ${f.wide ? 'sm:col-span-2' : ''}`}>
      <div className="flex items-center"><label htmlFor={id} className="text-sm font-medium">{f.label}{!f.required && CAN_BE_BLANK.has(f.kind) && <span className="font-normal text-muted-foreground"> (optional)</span>}</label>{tip}</div>
      {input}
      {help}
    </div>
  )
}
