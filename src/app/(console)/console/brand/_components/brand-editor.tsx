'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Badge, Tag } from '@/components/ui/badge'
import { Segmented } from '@/components/ui/segmented'
import { LeaveDialog, SaveBar, useLeaveGuard } from '@/components/ui/unsaved'
import { useToast } from '@/components/ui/toast'
import { useErrorSummary } from '@/components/ui/field-error'
import { announce } from '@/components/shell/announce'
import { STORE_FONT_VARS } from '@/components/shop-preview/fonts'
import { BRAND_FONT_VARS } from '@/components/shop-preview/brand-fonts'
import { PREVIEWS, PreviewSurface, type PreviewName, type Sample } from '@/components/shop-preview/brand-surfaces'
import { brandProblems, logoFileProblem, sniffLogo } from '@/domains/brand/check'
import { changesOf } from '@/domains/brand/diff'
import { normalHex, type BrandRecord, type LogoSlot } from '@/domains/brand/record'
import { urlFor } from '@/domains/media/sizes'
import { formatInr } from '@/lib/format'
import type { Paise } from '@/domains/money/paise'
import { saveBrandAction, undoBrandAction, uploadSvgLogoAction } from '../actions'
import { ColoursCard, LogoCard, ShapeCard, TypeCard, type SlotState } from './brand-cards'
import { previewed, VersionSwitch, type Version } from './version-switch'
// Only while a partner's change waits: its script loads when it is drawn (O2a·9 kept these pages under 150 kB).
const ReviewCard = dynamic(() => import('./review-card').then((m) => m.ReviewCard))

// =============================================================================
// Console › Brand (one-address plan P1·8; owner-approved mockup docs/mockups/2026-11-16-p1-brand.html, screens 1–6).
// One draft of the record; the preview redraws from it at once and the save bar counts its changes. Save: the record
// live (toast "Saved." with Undo), or, for the store's partner once it is open, sent to the owner (chip "Waiting for the
// owner", toast "Sent to the owner."). The owner and a Manager see a waiting change at the top with Approve change and
// Decline (a support visit reads it without them), and anyone who sees it compares Live and Waiting on the preview
// (four-screens mockup § 4, call 8). A Builder and a support visit read the page as facts ("Preview only"). Who may do what is the server's
// (src/domains/brand/who.ts); `mode` only draws it.
// =============================================================================

export type Mode = 'edit' | 'waits' | 'preview'
export type Waiting = { id: string; record: BrandRecord; proposedAt: string; proposer: string | null }

export function BrandEditor({ tenantId, mode, live, version: startVersion, waiting, decides, sample, tagline, tabs }: {
  tenantId: string; mode: Mode; live: BrandRecord; version: number | null
  /** The waiting change: the partner's form starts from it; the owner and a Manager answer it. */
  waiting: Waiting | null; decides: boolean
  sample: Sample; tagline: string
  /** Brand's two tabs (one-address P2 mockup screen 8): Logo, colours and type · Checkout. */
  tabs?: React.ReactNode
}) {
  const router = useRouter()
  const toast = useToast()
  const edit = mode !== 'preview'
  const start = mode === 'waits' && waiting ? waiting.record : live
  const [saved, setSaved] = useState(start)
  const [draft, setDraft] = useState(start)
  const [version, setVersion] = useState(startVersion)
  const [slots, setSlots] = useState<Partial<Record<LogoSlot, SlotState>>>({})
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const [attempt, setAttempt] = useState(0)
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(mode === 'waits' && !!waiting)
  const form = useRef<HTMLFormElement>(null)

  // Mistakes are live (a chip turns red as a hex is typed); Save counts them in one toast with Show (mockup screen 3).
  const live$ = useMemo(() => Object.fromEntries(brandProblems(draft).map((p) => [p.field, p.message])), [draft])
  const errors = { ...live$, ...serverErrors }
  const shown = attempt > 0 ? errors : live$
  const colours = Object.keys(shown).every((k) => !['display', 'body', 'radius', 'density', 'main'].includes(k))
  useErrorSummary(attempt > 0 ? shown : {}, { attempt, scope: form, noun: colours ? 'colour' : 'field' })
  const changes = changesOf(saved, draft)
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

  const set = (next: (b: BrandRecord) => BrandRecord, field?: string) => {
    setDraft(next)
    if (field) setServerErrors((e) => { const { [field]: _gone, ...rest } = e; return rest })
  }
  const colour = (role: keyof BrandRecord['palette'], v: string) => set((b) => ({ ...b, palette: { ...b.palette, [role]: (normalHex(v) ?? v) as `#${string}` } }), role)

  // After a write the button that was pressed may be gone: focus goes to the page's heading, a target that stays.
  const focusTop = () => window.setTimeout(() => { const h = document.querySelector<HTMLElement>('main h1'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }) } }, 0)

  async function pick(slot: LogoSlot, file: File) {
    setSlots((s) => ({ ...s, [slot]: { uploading: true } }))
    announce('Uploading…')
    const done = (st: SlotState, url?: string) => {
      setSlots((s) => ({ ...s, [slot]: st }))
      if (url) set((b) => ({ ...b, logos: { ...b.logos, [slot]: url } }), 'main')
      announce(st.error ?? 'Uploaded.')
    }
    try {
      const head = new Uint8Array(await file.slice(0, 512).arrayBuffer())
      const kind = sniffLogo(head)
      if (kind === 'svg') {
        const no = logoFileProblem({ kind, bytes: file.size })
        if (no) return done({ error: no })
        const r = await uploadSvgLogoAction(await file.text())
        return r.ok ? done({}, r.url) : done({ error: r.error })
      }
      const bitmap = kind ? await createImageBitmap(file).catch(() => null) : null
      const no = logoFileProblem({ kind, bytes: file.size, width: bitmap?.width ?? 0 })
      if (no) return done({ error: no })
      const { uploadPhoto } = await import('../../products/_components/upload-photos')
      const up = await uploadPhoto(file, tenantId, () => {}, 'brand')
      done({}, urlFor(up.base, 400))
    } catch (e) {
      done({ error: e instanceof Error ? e.message : 'That upload was refused. Try again in a minute.' })
    }
  }

  async function save() {
    if (Object.keys(live$).length) { setAttempt((a) => a + 1); return }
    setPending(true)
    const patch = { logos: draft.logos, palette: draft.palette, display: draft.display, body: draft.body, radius: draft.radius, density: draft.density }
    const r = await saveBrandAction({ version, patch })
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
    toast.ok('Saved.', v ? { undo: async () => { const u = await undoBrandAction({ version: v }); if (u.ok) { setVersion(u.version); router.refresh() } return u.ok ? { ok: true } : { ok: false, error: u.error } } } : undefined)
    router.refresh()
  }

  const chip = mode === 'preview' ? <Badge tone="neutral">Preview only</Badge> : sent && mode === 'waits' ? <Badge tone="warn">Waiting for the owner</Badge> : null
  const line = [tagline, sample.product ? formatInr(sample.product.price as Paise) : ''].filter(Boolean).join(' ')
  const typeSample = { title: sample.product?.title ?? sample.shopName, line: line || sample.shopName }
  const review = waiting && mode !== 'waits' ? <ReviewCard proposer={waiting.proposer} proposedAt={waiting.proposedAt} rows={brandChangeRows(live, waiting.record)} answer={decides ? { id: waiting.id, kind: 'brand' } : null} onDone={focusTop} /> : null
  // Live | Waiting (four-screens § 4), for anyone who sees a waiting change; the form's own edits win while unsaved.
  const [compare, setCompare] = useState<Version>('waiting')
  const shownRecord = previewed({ live, draft, waiting: waiting?.record ?? null, dirty, compare })
  // The first unsaved edit takes the preview over and hides the switch: say so once (design-system review).
  const hasWaiting = !!waiting
  useEffect(() => { if (hasWaiting && dirty) announce('The preview shows your edits.') }, [hasWaiting, dirty])
  const switcher = waiting && !dirty ? <VersionSwitch value={compare} onPick={setCompare} /> : null
  const cards = (
    <>
      <LogoCard b={draft} edit={edit} errors={shown} shopName={sample.shopName} slots={slots} onPick={pick} onRemove={(slot) => { set((b) => ({ ...b, logos: { ...b.logos, [slot]: null } }), 'main'); window.setTimeout(() => document.querySelector<HTMLElement>(`[data-logo="${slot}"] input[type=file]`)?.focus(), 0) }} />
      <ColoursCard b={draft} edit={edit} errors={shown} onColour={colour} />
      <TypeCard b={draft} edit={edit} errors={shown} sample={typeSample} onFont={(k, f) => set((b) => ({ ...b, [k]: f }), k)} />
      <ShapeCard b={draft} edit={edit} errors={shown} onRadius={(r) => set((b) => ({ ...b, radius: r }))} onDensity={(d) => set((b) => ({ ...b, density: d }))} />
    </>
  )
  return (
    <div className={`${STORE_FONT_VARS} ${BRAND_FONT_VARS}`}>
      <PageHeader title="Brand" badges={chip} />
      {tabs}
      <div className="mt-5 grid items-start gap-6 lg:grid-cols-[minmax(0,640px)_340px]">
        {/* Phone: the card first, then the switch and preview, then the editor (four-screens § 4). */}
        <div className="flex min-w-0 flex-col gap-4">{review}
          <div className="lg:hidden"><PreviewCard b={shownRecord} s={sample} switcher={switcher} phone /></div>
          <form ref={form} className="flex min-w-0 flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save() }}>{cards}
            {edit && dirty && <SaveBar placement="bottom" count={changes.length} pending={pending} keys="Ctrl+S" onSave={() => void save()} onDiscard={() => { setDraft(saved); setServerErrors({}); setSlots({}); setAttempt(0) }} />}
          </form>
        </div>
        <aside className="sticky top-4 hidden min-w-0 lg:block"><PreviewCard b={shownRecord} s={sample} switcher={switcher} /></aside>
      </div>
      <LeaveDialog open={!!guard.leaveTo} what="Brand" onStay={guard.stay} onLeave={() => guard.leave(() => setSaved(draft))} />
    </div>
  )
}

function PreviewCard({ b, s, switcher, phone = false }: { b: BrandRecord; s: Sample; switcher: React.ReactNode; phone?: boolean }) {
  const [which, setWhich] = useState<PreviewName>('Checkout')
  return (
    <Section title="Preview" action={<span className="flex flex-wrap items-center justify-end gap-2">{switcher}<Tag>Sample data</Tag></span>}>
      {phone ? <>
        <Segmented label="Preview" value={which} options={PREVIEWS.map((p) => [p, p] as const)} onPick={setWhich} className="self-start" />
        <div data-store-theme=""><PreviewSurface which={which} b={b} s={s} /></div>
      </> : <div className="flex flex-col gap-3.5">
        {PREVIEWS.map((p) => <div key={p}><p className="mb-1.5 text-small font-medium text-foreground">{p}</p><div data-store-theme=""><PreviewSurface which={p} b={b} s={s} /></div></div>)}
      </div>}
    </Section>
  )
}

/** Brand's review rows (P1 mockup screen 4): the logo files added or removed in one row, then each other part from → to. */
function brandChangeRows(live: BrandRecord, next: BrandRecord): [string, string][] {
  const cs = changesOf(live, next)
  const logos = cs.filter((c) => c.kind === 'logo')
  const added = logos.filter((c) => c.to).map((c) => c.label), gone = logos.filter((c) => !c.to).map((c) => c.label)
  const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)
  const rows: [string, string][] = []
  if (added.length || gone.length) rows.push(['Logo', [added.length ? `${list(added)} added` : '', gone.length ? `${list(gone)} removed` : ''].filter(Boolean).join(' · ')])
  for (const c of cs.filter((x) => x.kind !== 'logo')) rows.push([c.label, `${c.from} → ${c.to}`])
  return rows
}
