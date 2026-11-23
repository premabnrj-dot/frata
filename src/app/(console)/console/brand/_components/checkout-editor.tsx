'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { STORE_FONT_VARS } from '@/components/shop-preview/fonts'
import { BRAND_FONT_VARS } from '@/components/shop-preview/brand-fonts'
import { Section } from '@/components/layout/section'
import { Facts } from '@/components/data/facts'
import { Badge, Tag } from '@/components/ui/badge'
import { FIELD, FIELD_BOX } from '@/components/ui/field'
import { FieldError, fieldProps, useErrorSummary } from '@/components/ui/field-error'
import { InfoTip } from '@/components/ui/info-tip'
import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import { LeaveDialog, SaveBar, useLeaveGuard } from '@/components/ui/unsaved'
import { useToast } from '@/components/ui/toast'
import dynamic from 'next/dynamic'
import type { PreviewData } from '@/components/shop-preview/checkout-preview'
import { designChangeRows, designChanges, checkoutProblems, HEADING_MAX, MAX_TRUST, THANKS_MAX, trustBlocks, trustOrder, trustWords, TRUST_NAMES, type CheckoutDesign, type TrustFacts, type TrustKey } from '@/domains/brand/checkout'
import { PREVIEW_PAGES, PREVIEW_STATES, type PreviewPage, type PreviewState } from '@/domains/brand/checkout-sample'
import type { BrandRecord } from '@/domains/brand/record'
import { cn } from '@/lib/utils'
import { announce } from '@/components/shell/announce'
import { saveCheckoutAction, undoCheckoutAction } from '../actions'
import { previewed, ReviewCard, VersionSwitch, type Version } from './review-card'

// =============================================================================
// Console › Brand › Checkout (one-address plan P2·6; owner-approved mockup docs/mockups/2026-11-16-p2-checkout.html,
// screens 8–10). One draft of the checkout design; the preview redraws from it at once and the save bar counts its
// changes. Save: live (toast "Saved." with Undo), or, for the store's partner once it is open, sent to the owner (chip
// "Waiting for the owner", toast "Sent to the owner."). The owner and a Manager answer it on the review card at the top,
// as on Brand, or in Notices; staff and a support visit read the card; anyone who sees it compares Live and Waiting on
// the preview (four-screens mockup § 4). The two lines are checked as typed,
// with the server's own rule (src/domains/brand/checkout.ts), each refusal at its field; Save counts them in one toast.
// A Builder and a support visit read the tab as facts beside the preview ("Preview only"). Who may do what is the
// server's (src/domains/brand/who.ts); `mode` only draws it.
// =============================================================================

export type CheckoutMode = 'edit' | 'waits' | 'preview'

// The preview is its own chunk (the console page's first-load budget, check:storefront-build's app budget): the cards
// paint first, the preview a moment later, in a box of its own height so nothing moves.
const CheckoutPreview = dynamic(() => import('@/components/shop-preview/checkout-preview').then((m) => m.CheckoutPreview), {
  ssr: false, loading: () => <div className="h-[640px] rounded-md border border-border bg-sunk" aria-hidden="true" />,
})

export type WaitingDesign = { id: string; design: CheckoutDesign; proposedAt: string; proposer: string | null }

export function CheckoutEditor({ mode, live, version: startVersion, waiting, decides, record, shopName, facts, data, tabs }: {
  mode: CheckoutMode; live: CheckoutDesign; version: number | null
  /** The store's waiting change: the partner's form starts from it; the owner and a Manager answer it. */
  waiting: WaitingDesign | null; decides: boolean
  record: BrandRecord; shopName: string; facts: TrustFacts; data: PreviewData; tabs: React.ReactNode
}) {
  const router = useRouter()
  const toast = useToast()
  const edit = mode !== 'preview'
  const start = mode === 'waits' && waiting ? waiting.design : live
  const [saved, setSaved] = useState(start)
  const [draft, setDraft] = useState(start)
  const [version, setVersion] = useState(startVersion)
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const [attempt, setAttempt] = useState(0)
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(mode === 'waits' && !!waiting)
  const form = useRef<HTMLFormElement>(null)

  // The lines' refusals are live as typed (screen 9); Save counts them in one error toast with Show.
  const live$ = useMemo(() => Object.fromEntries(checkoutProblems(draft).map((p) => [p.field, p.message])), [draft])
  const errors: Record<string, string> = { ...live$, ...serverErrors }
  useErrorSummary(attempt > 0 ? errors : {}, { attempt, scope: form, noun: 'line' })
  const changes = designChanges(saved, draft)
  const dirty = changes.length > 0
  const guard = useLeaveGuard(dirty)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's' || e.altKey || e.shiftKey) return
      e.preventDefault()
      if (e.isComposing || document.querySelector('dialog:modal')) return
      document.querySelector<HTMLButtonElement>('button[data-save-bar]:not(:disabled)')?.click()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const set = (patch: Partial<CheckoutDesign>, field?: string) => {
    setDraft((d) => ({ ...d, ...patch }))
    if (field) setServerErrors((e) => { const { [field]: _gone, ...rest } = e; return rest })
  }
  const focusTop = () => window.setTimeout(() => { const h = document.querySelector<HTMLElement>('main h1'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }) } }, 0)

  async function save() {
    if (Object.keys(live$).length) { setAttempt((a) => a + 1); return }
    setPending(true)
    const r = await saveCheckoutAction({ version, design: draft })
    setPending(false)
    if (!r.ok) {
      if (r.fields && Object.keys(r.fields).length) { setServerErrors(r.fields as Record<string, string>); setAttempt((a) => a + 1); return }
      toast.error(r.error, /Reload/.test(r.error) ? { action: { label: 'Reload', run: () => window.location.reload() } } : undefined)
      return
    }
    setSaved(draft); setServerErrors({}); setAttempt(0); focusTop()
    if (r.outcome === 'waits') { setSent(true); toast.ok('Sent to the owner.'); router.refresh(); return }
    setVersion(r.version)
    const v = r.version
    toast.ok('Saved.', v ? { undo: async () => { const u = await undoCheckoutAction({ version: v }); if (u.ok) { setVersion(u.version); router.refresh() } return u.ok ? { ok: true } : { ok: false, error: u.error } } } : undefined)
    router.refresh()
  }

  const chip = mode === 'preview' ? <Badge tone="neutral">Preview only</Badge> : sent && mode === 'waits' ? <Badge tone="warn">Waiting for the owner</Badge> : null
  const back = `“Back to ${shopName}” link`
  const review = waiting && mode !== 'waits' ? <ReviewCard proposer={waiting.proposer} proposedAt={waiting.proposedAt} rows={designChangeRows(live, waiting.design, shopName)} answer={decides ? { id: waiting.id, kind: 'checkout' } : null} onDone={focusTop} /> : null
  // Live | Waiting (four-screens § 4), for anyone who sees a waiting change; the form's own edits win while unsaved.
  const [compare, setCompare] = useState<Version>('waiting')
  const shown = previewed({ live, draft, waiting: waiting?.design ?? null, dirty, compare })
  // The first unsaved edit takes the preview over and hides the switch: say so once (design-system review).
  const hasWaiting = !!waiting
  useEffect(() => { if (hasWaiting && dirty) announce('The preview shows your edits.') }, [hasWaiting, dirty])
  const switcher = waiting && !dirty ? <VersionSwitch value={compare} onPick={setCompare} /> : null
  const cards = edit ? <>
    <Section title="Header">
      <div className="flex flex-col gap-1.5"><span className="text-label font-medium">Logo</span>
        <Segmented label="Logo" value={draft.header} options={[['left', 'Left'], ['centre', 'Centred']]} onPick={(v) => set({ header: v })} className="self-start" /></div>
      <div className="flex min-h-11 items-center justify-between gap-3"><span id="ck-back" className="text-sm">{back}</span>
        <Switch on={draft.back} onChange={(on) => set({ back: on })} label={back} /></div>
    </Section>
    <Section title="Footer">
      <div className="flex flex-col gap-1.5"><span className="text-label font-medium">Policy links</span>
        <Segmented label="Policy links" value={String(draft.rows)} options={[['1', 'One row'], ['2', 'Two rows']]} onPick={(v) => set({ rows: v === '2' ? 2 : 1 })} className="self-start" /></div>
      <Facts className="grid-cols-[116px_minmax(0,1fr)] md:grid-cols-[180px_minmax(0,1fr)]" rows={[['Legal block', 'Always shown']]} />
    </Section>
    <TrustCard draft={draft} facts={facts} onTrust={(trust) => set({ trust }, 'trust')} error={errors.trust} />
    <Section title="Your words">
      <p className="-mt-2.5 text-label text-muted-foreground">Plain text. No phone numbers, UPI IDs or links.</p>
      <LineField name="heading" label="Checkout heading" value={draft.heading} max={HEADING_MAX} error={errors.heading} onChange={(v) => set({ heading: v }, 'heading')} />
      <LineField name="thanks" label="Thank-you line" value={draft.thanks} max={THANKS_MAX} error={errors.thanks} area onChange={(v) => set({ thanks: v }, 'thanks')} />
    </Section>
  </> : <>
    <Section title="Header"><Facts className="grid-cols-[116px_minmax(0,1fr)] md:grid-cols-[180px_minmax(0,1fr)]" rows={[['Logo', draft.header === 'centre' ? 'Centred' : 'Left'], [back, draft.back ? 'On' : 'Off']]} /></Section>
    <Section title="Footer"><Facts className="grid-cols-[116px_minmax(0,1fr)] md:grid-cols-[180px_minmax(0,1fr)]" rows={[['Policy links', draft.rows === 2 ? 'Two rows' : 'One row'], ['Legal block', 'Always shown']]} /></Section>
    <Section title="Trust blocks"><Facts className="grid-cols-[116px_minmax(0,1fr)] md:grid-cols-[180px_minmax(0,1fr)]" rows={trustBlocks(draft.trust, facts).map((b, n) => [<span key={b.key} className="tabular-nums">{n + 1}</span>, b.words])} /></Section>
    <Section title="Your words"><Facts className="grid-cols-[116px_minmax(0,1fr)] md:grid-cols-[180px_minmax(0,1fr)]" rows={[['Checkout heading', draft.heading || 'Checkout'], ['Thank-you line', draft.thanks || '—']]} /></Section>
  </>
  return (
    <div className={`${STORE_FONT_VARS} ${BRAND_FONT_VARS}`}>
      <PageHeader title="Brand" badges={chip} />
      {tabs}
      <div className="mt-5 grid items-start gap-6 lg:grid-cols-[minmax(0,640px)_340px]">
        {/* Phone: the card first, then the switch and preview, then the editor (four-screens § 4). */}
        <div className="flex min-w-0 flex-col gap-4">{review}
          <div className="lg:hidden"><PreviewCard record={record} design={shown} facts={facts} data={data} switcher={switcher} /></div>
          <form ref={form} className="flex min-w-0 flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save() }}>{cards}
            {edit && dirty && <SaveBar placement="bottom" count={changes.length} pending={pending} keys="Ctrl+S" onSave={() => void save()} onDiscard={() => { setDraft(saved); setServerErrors({}); setAttempt(0) }} />}
          </form>
        </div>
        <aside className="sticky top-4 hidden min-w-0 lg:block"><PreviewCard record={record} design={shown} facts={facts} data={data} switcher={switcher} /></aside>
      </div>
      <LeaveDialog open={!!guard.leaveTo} what="the checkout" onStay={guard.stay} onLeave={() => guard.leave(() => setSaved(draft))} />
    </div>
  )
}

function MoveBtn({ dir, words, disabled, onMove }: { dir: 'up' | 'down'; words: string; disabled: boolean; onMove: () => void }) {
  return (
    <button type="button" id={`move-${dir}-${words}`} aria-label={dir === 'up' ? 'Move up' : 'Move down'} aria-disabled={disabled || undefined} onClick={onMove}
      className="grid size-11 place-items-center rounded-md border border-border text-muted-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-40 md:size-7">
      <svg viewBox="0 0 24 24" className="size-3.5 fill-none stroke-current stroke-[1.8]" aria-hidden="true"><path d={dir === 'up' ? 'm6 14.5 6-6 6 6' : 'm6 9.5 6 6 6-6'} /></svg>
    </button>
  )
}

function TrustCard({ draft, facts, onTrust, error }: { draft: CheckoutDesign; facts: TrustFacts; onTrust: (t: TrustKey[]) => void; error?: string }) {
  const on = draft.trust, full = on.length >= MAX_TRUST
  const words = (k: TrustKey) => trustWords(k, facts) ?? TRUST_NAMES[k]
  // Sortable's pattern (src/components/ui/sortable.ts): say where it went, and keep focus on the button pressed.
  const move = (k: TrustKey, dir: 'up' | 'down') => {
    const i = on.indexOf(k), j = i + (dir === 'up' ? -1 : 1)
    if (j < 0 || j >= on.length) { announce(`${words(k)} is already ${dir === 'up' ? 'first' : 'last'}.`); return }
    const n = [...on]; n.splice(i, 1); n.splice(j, 0, k); onTrust(n)
    announce(`${words(k)} moved to ${j + 1} of ${on.length}.`)
    requestAnimationFrame(() => document.getElementById(`move-${dir}-${k}`)?.focus())
  }
  return (
    <Section title={<span className="flex items-center gap-1">Trust blocks<InfoTip about="trust blocks">Words from your delivery, returns and payment settings.</InfoTip></span>}>
      <p id="trust-limit" className="-mt-2.5 text-label text-muted-foreground">Up to {MAX_TRUST}.</p>
      <ul className="divide-y divide-line-soft">
        {trustOrder(on).map((k) => {
          const at = on.indexOf(k), checked = at >= 0
          return (
            <li key={k} className={cn('flex min-h-12 items-center gap-3', !checked && 'text-muted-foreground')}>
              <input id={`trust-${k}`} type="checkbox" className="size-6 shrink-0 accent-primary" checked={checked} aria-disabled={!checked && full ? true : undefined} aria-describedby="trust-limit"
                onChange={(e) => { if (e.target.checked) { if (full) announce(`Up to ${MAX_TRUST} blocks. Turn one off first.`); else onTrust([...on, k]) } else onTrust(on.filter((x) => x !== k)) }} />
              <label htmlFor={`trust-${k}`} className="flex-1 text-sm">{words(k)}</label>
              {checked && <span className="flex gap-1">
                <MoveBtn dir="up" words={k} disabled={at === 0} onMove={() => move(k, 'up')} />
                <MoveBtn dir="down" words={k} disabled={at === on.length - 1} onMove={() => move(k, 'down')} />
              </span>}
            </li>
          )
        })}
      </ul>
      <FieldError name="trust" message={error} />
    </Section>
  )
}

function LineField({ name, label, value, max, error, area = false, onChange }: { name: string; label: string; value: string; max: number; error?: string; area?: boolean; onChange: (v: string) => void }) {
  const n = value.normalize('NFC').trim().length
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3"><label htmlFor={`line-${name}`} className="text-label font-medium">{label}</label>
        <span id={`line-${name}-count`} className={cn('tabular-nums text-small', n > max ? 'font-medium text-danger-text' : 'text-muted-foreground')}>{n}/{max}</span></div>
      {area ? <textarea id={`line-${name}`} rows={3} maxLength={max * 5} value={value} onChange={(e) => onChange(e.target.value)} className={cn(FIELD_BOX, 'py-2')} {...fieldProps(name, error)} aria-describedby={cn(error && `${name}-error`, `line-${name}-count`)} />
        : <input id={`line-${name}`} maxLength={max * 5} value={value} onChange={(e) => onChange(e.target.value)} className={FIELD} {...fieldProps(name, error)} aria-describedby={cn(error && `${name}-error`, `line-${name}-count`)} />}
      <FieldError name={name} message={error} />
    </div>
  )
}

function PreviewCard({ record, design, facts, data, switcher }: { record: BrandRecord; design: CheckoutDesign; facts: TrustFacts; data: PreviewData; switcher: React.ReactNode }) {
  const [page, setPage] = useState<PreviewPage>('checkout')
  const [state, setState] = useState<PreviewState>('ready')
  // Two cards draw (phone first, computer beside): each its own id.
  const sel = useId()
  return (
    <Section title="Preview" action={<span className="flex flex-wrap items-center justify-end gap-2">{switcher}<Tag>Sample data</Tag></span>}>
      <Segmented label="Preview" value={page} options={PREVIEW_PAGES} onPick={setPage} className="self-start" />
      <div className="flex items-center gap-2"><label htmlFor={sel} className="text-label font-medium">Show</label>
        <select id={sel} className={cn(FIELD, 'flex-1')} value={state} disabled={page !== 'checkout'} onChange={(e) => setState(e.target.value as PreviewState)}>
          {PREVIEW_STATES.map(([v, w]) => <option key={v} value={v}>{w}</option>)}
        </select></div>
      <CheckoutPreview record={record} design={design} data={data} trust={trustBlocks(design.trust, facts)} page={page} state={state} />
    </Section>
  )
}
