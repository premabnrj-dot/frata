'use client'

import Link from 'next/link'
import { button } from '@/components/ui/button'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { InfoTip } from '@/components/ui/info-tip'
import { LeaveDialog, Message, SaveBar, useLeaveGuard } from '@/components/ui/unsaved'
import {
  BrandPreview, CheckoutPreview, ContactPreview, FooterPreview, InvoicePreview, PolicyPreview, type ShopFacts,
} from '@/components/shop-preview/previews'
import { STORE_FONT_VARS } from '@/components/shop-preview/fonts'
import { POLICY_PAGES, type PolicyPage } from '@/domains/policies/render'
import { draftPatch, sectionFor, type Field, type Values } from '@/domains/settings/sections'
import { saveSection } from '../actions'
import { PolicyPages } from './policy-pages'
import { ShopLogo } from './shop-logo'
import { DocLogo } from './doc-logo'
import { UnratedNotice } from './unrated'
import type { Unrated } from '@/domains/tax/rates'
import { Section } from '@/components/layout/section'
import { PageHeader } from '@/components/layout/page-header'
import { Switch } from '@/components/ui/switch'
import { STATES, STATE_CODE } from '@/domains/checkout/states'

/**
 * One settings page: the fields its section defines, ONE explicit save, an
 * "Unsaved changes" bar on the first edit, a guard on leaving, and the shop
 * beside it as shoppers will see it (frata-design-language § Phase 1).
 */
export function SettingsForm({ sectionKey, initial, version: startVersion, facts, fiscalYear, overrides, tenantId, unrated = null, held = [] }: {
  sectionKey: string
  initial: Values
  version: number
  facts: ShopFacts
  fiscalYear: string
  overrides: Record<string, string>
  /** For an upload's path (Settings › Documents' logo). */
  tenantId: string
  /** Taxes: live products checkout refuses for want of a GST rate (null: the shop charges no GST). */
  unrated?: Unrated | null
  /** Fields another app sets now (Delivery Zones while usable): left out here, with one link to where they are set. */
  held?: readonly string[]
}) {
  const section = sectionFor(sectionKey)!
  const router = useRouter()
  const [saved, setSaved] = useState(initial)
  const [values, setValues] = useState(initial)
  const [version, setVersion] = useState(startVersion)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [conflict, setConflict] = useState(false)
  const [pending, start] = useTransition()
  const [policyPage, setPolicyPage] = useState<PolicyPage>('returns')
  // The save's own answer wins over the page's until the page is loaded again.
  const [unratedNow, setUnratedNow] = useState<Unrated | null | undefined>(undefined)

  const dirty = JSON.stringify(values) !== JSON.stringify(saved)
  const preview: ShopFacts = useMemo(() => {
    const p = draftPatch(section, values) as Partial<ShopFacts> & { name?: string }
    return { ...facts, ...p, shopName: typeof p.name === 'string' && p.name ? p.name : facts.shopName }
  }, [section, values, facts])

  const guard = useLeaveGuard(dirty)

  const set = (k: string, v: string | boolean) => { setValues((x) => ({ ...x, [k]: v })); setErrors((e) => { const { [k]: _, ...rest } = e; return rest }); setMessage(null) }

  function save() {
    start(async () => {
      const r = await saveSection(section.key, values, version)
      if (r.ok) { setSaved(values); setVersion(r.version); setErrors({}); if (section.key === 'taxes') setUnratedNow(r.unrated ?? null); setMessage({ tone: 'ok', text: section.key === 'documents' ? 'Saved. New slips and invoices use it; issued invoices keep theirs.' : 'Saved. Your shop shows it now.' }); router.refresh(); return }
      setErrors(r.errors ?? {}); setConflict(!!r.conflict); setMessage({ tone: 'error', text: r.error })
      const first = r.errors && Object.keys(r.errors)[0]
      if (first) document.getElementById(`f-${first}`)?.focus()
    })
  }

  const previewEl = section.preview === 'footer' ? <FooterPreview f={preview} />
    : section.preview === 'contact' ? <ContactPreview f={preview} />
    : section.preview === 'brand' ? <BrandPreview f={preview} />
    : section.preview === 'checkout' ? <CheckoutPreview f={preview} />
    : section.preview === 'invoice' ? <InvoicePreview f={preview} fiscalYear={fiscalYear} />
    : <PolicyPreview f={preview} page={policyPage} override={overrides[policyPage]} />

  return (
    <div className={STORE_FONT_VARS}>
      {dirty && <SaveBar pending={pending} onSave={save} onDiscard={() => { setValues(saved); setErrors({}); setMessage(null) }} />}
      <PageHeader title={section.title} back={{ href: '/console/settings', label: 'Settings' }} />
      <p className="text-sm text-muted-foreground">{section.intro}</p>
      <Message m={message} onReload={conflict ? () => window.location.reload() : undefined} />
      {section.key === 'taxes' && <UnratedNotice u={unratedNow !== undefined ? unratedNow : unrated} />}
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); if (dirty) save() }}>
          {section.key === 'brand' && <ShopLogo tenantId={tenantId} current={facts.logoUrl ?? null} />}
          {section.key === 'documents' && <DocLogo tenantId={tenantId} current={facts.docLogo} />}
          {section.blocks.some((b) => b.fields.some((f) => held.includes(f.key))) && (
            <Section title="Set in Delivery Zones" action={<Link href="/console/apps/delivery_zones" className={button({ variant: 'secondary' })}>Open Delivery Zones</Link>} />
          )}
          {section.blocks.map((b) => ({ b, shown: b.fields.filter((f) => !held.includes(f.key)).filter((f) => !f.showIf || f.showIf.in.includes(String(values[f.showIf.key] ?? ''))) })).filter(({ shown }) => shown.length).map(({ b, shown }) => (
            <Section key={b.title}>
              <h2 className="flex items-center text-section font-semibold">{b.title}{b.tip ? <InfoTip about={b.title.toLowerCase()}>{b.tip}</InfoTip> : null}</h2>
              {b.hint && <p className="-mt-1 text-sm text-muted-foreground">{b.hint}</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                {shown.map((f) => <FieldInput key={f.key} f={f} value={values[f.key]} error={errors[f.key]} onChange={(v) => set(f.key, v)}
                  locked={f.key === 'b2bInvoices' && values.turnoverBand !== undefined && values.turnoverBand !== 'under_5cr' ? 'Off at ₹5 crore and above until e-invoicing is set up.' : undefined} />)}
              </div>
            </Section>
          ))}
          {section.key === 'policies' && <PolicyPages facts={preview} overrides={overrides} selected={policyPage} onSelect={setPolicyPage} pagesDirty={dirty} />}
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

      <LeaveDialog open={!!guard.leaveTo} what={section.title} onStay={guard.stay} onLeave={() => guard.leave(() => setSaved(values))} />
    </div>
  )
}

/** "(optional)" only where a field can really be left empty; a dropdown or a number always holds a value. */
const CAN_BE_BLANK = new Set(['text', 'textarea', 'email', 'phone', 'gstin', 'pincodes'])

function FieldInput({ f, value, error, onChange, locked }: { f: Field; value: Values[string] | undefined; error?: string; onChange: (v: string | boolean) => void
  /** Held off for a reason another field gives (said under it). */
  locked?: string }) {
  const id = `f-${f.key}`
  const described = `${id}-h`
  const base = 'w-full rounded-md border border-input bg-card px-3 text-sm aria-invalid:border-danger-text'
  // Only an error or a limit/money/legal line is said under the field; detail is behind the (i).
  const line = error ?? f.hint
  const help = line ? <p id={described} className={`text-xs ${error ? 'text-danger-text' : 'text-muted-foreground'}`}>{line}</p> : null
  const tip = f.tip ? <InfoTip about={f.label.toLowerCase()}>{f.tip}</InfoTip> : null
  if (f.kind === 'switch') {
    return (
      <div className="space-y-1 sm:col-span-2">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center"><label htmlFor={id} className="text-sm font-medium">{f.label}</label>{tip}</span>
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
        <div role="radiogroup" aria-label={f.label} className="grid gap-2 sm:grid-cols-3">
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
        <div role="radiogroup" aria-labelledby={`${id}-l`} className="inline-flex max-w-full flex-wrap gap-0.5 rounded-lg bg-muted p-0.5">
          {f.options!.map(([o, l]) => (
            <button key={o} id={value === o ? id : undefined} type="button" role="radio" aria-checked={value === o} onClick={() => onChange(o)}
              className={`min-h-9 rounded-md px-3 text-sm font-medium transition-[background-color,color] duration-fast ${value === o ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{l}</button>
          ))}
        </div>
        {help}
      </div>
    )
  }
  const common = { id, 'aria-invalid': !!error || undefined, 'aria-describedby': line ? described : undefined }
  const v = typeof value === 'string' ? value : ''
  let input: React.ReactNode
  if (f.kind === 'textarea' || f.kind === 'pincodes') input = <textarea {...common} rows={3} maxLength={f.max} value={v} onChange={(e) => onChange(e.target.value)} className={`${base} py-2 ${f.kind === 'pincodes' ? 'font-mono' : ''}`} />
  else if (f.kind === 'state') input = <select {...common} value={v} onChange={(e) => onChange(e.target.value)} className={`${base} h-10 md:h-9`}><option value="">Choose</option>{STATES.map((st) => <option key={st} value={STATE_CODE[st]}>{st}</option>)}</select>
  else if (f.kind === 'select') input = <select {...common} value={v} onChange={(e) => onChange(e.target.value)} className={`${base} h-10 md:h-9`}>{f.options!.map(([o, l]) => <option key={o} value={o}>{l}</option>)}</select>
  else {
    const numeric = f.kind === 'rupees' || f.kind === 'days' || f.kind === 'hsn'
    input = (
      <div className="flex items-center gap-1.5">
        {f.kind === 'rupees' && <span className="text-sm text-muted-foreground">₹</span>}
        {f.kind === 'phone' && <span className="text-sm text-muted-foreground">+91</span>}
        <input {...common} value={v} maxLength={f.max} onChange={(e) => onChange(e.target.value)}
          type={f.kind === 'email' ? 'email' : 'text'} inputMode={numeric ? 'numeric' : f.kind === 'phone' ? 'tel' : f.kind === 'email' ? 'email' : undefined}
          autoCapitalize={f.kind === 'gstin' ? 'characters' : undefined}
          className={`${base} h-10 md:h-9 ${numeric || f.kind === 'phone' || f.kind === 'gstin' ? 'font-mono' : ''}`} />
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
