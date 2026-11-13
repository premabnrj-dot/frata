'use client'

import { useEffect, useRef, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { Icon } from '@/components/icons/icon'
import { BOUND_QUESTION, type Bound } from '@/domains/policies/answers'
import { FAQ_DEFAULT, FAQ_ID, MAX_FAQ, TEMPLATES, TEMPLATE_NAMES, handleOf, type FaqItem, type PageDraft, type PageFill, type PageTemplate } from '@/domains/pages/templates'
import type { SectionOf } from '@/domains/themes/sections'
import { addPageAction, removePageAction, savePageAction } from '@/app/(console)/console/look/page-actions'
import type { EditorPage } from '@/lib/queries/pages'
import { Switch, Text } from './controls'
import { DesignForm } from './design-form'
import type { FormCtx } from './section-form'
import { FIELD_BOX } from '@/components/ui/field'

// =============================================================================
// Look › Pages (Theme Studio TS1a, board v2). Loaded only when a page is opened (next/dynamic: the customizer holds its
// 208 kB script ceiling). Contact edits the look's own layer (its line); About and FAQ are pages of their own, each
// saved as a draft (800 ms after a change) and published with the look. What comes from Settings is shown read-only
// with Change in Settings: it is never typed twice.
// =============================================================================

export type ContactRow = { label: string; value: string | null }
const SETTINGS = '/console/settings/contact'
const move = <T,>(xs: T[], i: number, by: -1 | 1) => { const j = i + by; if (j < 0 || j >= xs.length) return xs; const out = [...xs]; [out[i], out[j]] = [out[j]!, out[i]!]; return out }
const field = `${FIELD_BOX} w-full placeholder:italic placeholder:text-muted-foreground`

function FromSettings({ rows }: { rows: ContactRow[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center gap-2 bg-muted px-3 py-2 text-xs font-semibold"><Icon name="gear" className="size-3.5" />From your Settings<a href={SETTINGS} className="ml-auto font-medium text-info-text">Change in Settings</a></div>
      <ul>{rows.map((r) => <li key={r.label} className="grid grid-cols-[8rem_minmax(0,1fr)] gap-2 border-t border-border px-3 py-2 text-sm"><span>{r.label}</span><span className={`min-w-0 break-words ${r.value ? '' : 'text-warn-text'}`}>{r.value ?? 'Add it in Settings'}</span></li>)}</ul>
    </div>
  )
}

/** Contact (/policies/contact): the owner's line; the rest from Settings. */
export function ContactPanel({ line, setLine, rows, address }: { line: string; setLine: (l: string) => void; rows: ContactRow[]; address: string }) {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">Contact</h2>
      <p className="font-mono text-xs text-muted-foreground">{address}/policies/contact</p>
      <Text label="A line above (optional)" value={line} max={160} onChange={setLine} />
      <FromSettings rows={rows} />
    </div>
  )
}

function Questions({ items, set, answers }: { items: FaqItem[]; set: (x: FaqItem[]) => void; answers: Record<Bound, string | null> }) {
  const item = (i: number, v: Partial<{ q: string; a: string }>) => set(items.map((x, j) => (j === i ? ({ ...x, ...v } as FaqItem) : x)))
  return (
    <div className="space-y-2">
      <p className="flex items-center text-sm font-medium">Questions<span className="ml-auto font-mono text-xs font-normal text-muted-foreground">{items.length}/{MAX_FAQ}</span></p>
      <ol className="space-y-2">
        {items.map((x, i) => (
          <li key={i} className="space-y-2 rounded-xl border border-input p-2.5">
            <div className="flex items-center gap-1">
              <input aria-label={`Question ${i + 1}`} value={x.q} maxLength={80} onChange={(e) => item(i, { q: e.target.value })} className={`${field} h-11 md:h-9 flex-1`} />
              <button type="button" aria-label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => set(move(items, i, -1))} className="grid size-9 place-items-center rounded-md disabled:opacity-30"><Icon name="up" className="size-4" /></button>
              <button type="button" aria-label={`Move question ${i + 1} down`} disabled={i === items.length - 1} onClick={() => set(move(items, i, 1))} className="grid size-9 place-items-center rounded-md disabled:opacity-30"><Icon name="down" className="size-4" /></button>
              <button type="button" aria-label={`Remove question ${i + 1}`} onClick={() => set(items.filter((_, j) => j !== i))} className="grid size-9 place-items-center rounded-md"><Icon name="close" className="size-3.5" /></button>
            </div>
            {'bound' in x
              ? <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground"><span className="mr-1.5 rounded-full bg-info px-2 py-0.5 text-xs font-semibold text-info-text">From your settings</span>{answers[x.bound] ?? 'Shows once Settings has what it answers'}</div>
              : <>
                <textarea aria-label={`Answer ${i + 1}`} value={x.a} maxLength={600} rows={3} placeholder={FAQ_DEFAULT.find((d) => d.q === x.q)?.a ?? ''} onChange={(e) => item(i, { a: e.target.value })} className={`${field} py-2`} />
                {!x.a.trim() && <p className="text-xs text-warn-text">Write your own answer</p>}
              </>}
          </li>
        ))}
      </ol>
      {items.length < MAX_FAQ && <button type="button" onClick={() => set([...items, { q: '', a: '' }])} className="w-full rounded-xl border-[1.5px] border-dashed border-input px-3 py-2.5 text-sm font-medium hover:border-foreground">Add a question</button>}
      {(Object.keys(BOUND_QUESTION) as Bound[]).filter((b) => !items.some((x) => 'bound' in x && x.bound === b)).map((b) => (
        items.length < MAX_FAQ && <button key={b} type="button" onClick={() => set([...items, { q: BOUND_QUESTION[b], bound: b }])} className="block text-sm text-info-text underline underline-offset-4">Add “{BOUND_QUESTION[b]}” from your settings</button>
      ))}
    </div>
  )
}

/** An About or FAQ page's form; saves its own draft. `onSaved` gives the new version (the editor publishes it). */
export function PagePanel({ page, c, answers, address, onSaved, onRemoved, registerFlush }: {
  page: EditorPage; c: FormCtx; answers: Record<Bound, string | null>; address: string
  onSaved: (p: EditorPage) => void; onRemoved: (id: string, version: number | null) => void
  /** The editor's Publish saves a waiting change first (impact review: an edit in the last 800 ms was dropped). */
  registerFlush: (f: (() => Promise<void>) | null) => void
}) {
  const [draft, setDraft] = useState<PageDraft>(page.draft)
  const toast = useToast()
  // A refused save or removal is an error toast (§ Feedback 1); the next save that works takes it away.
  const shown = useRef<number | null>(null)
  const refused = (text: string) => { shown.current = toast.next(); toast.error(text) }
  const version = useRef(page.version)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(draft)
  latest.current = draft
  const save = async () => {
    timer.current = null
    // An address with a dash at either end is saved without it (typing "our-" mid-word never errors).
    const d = latest.current, handle = d.handle.replace(/^-+|-+$/g, '') || 'page'
    const r = await savePageAction({ id: page.id, version: version.current, draft: { ...d, handle } })
    if (!r.ok) { refused(r.error); return }
    if (shown.current !== null) { toast.dismiss(shown.current); shown.current = null }
    version.current = r.version
    onSaved({ ...page, version: r.version, draft: { ...d, handle }, dirty: true })
  }
  const flush = async () => { if (timer.current) { clearTimeout(timer.current); await save() } }
  // Closing the page (another page, Home) saves a waiting change instead of dropping it; Publish flushes it too.
  const saveNow = useRef(save)
  saveNow.current = save
  useEffect(() => { registerFlush(flush) })
  // Only when the page closes (another page, Home): a waiting change saves instead of being dropped.
  useEffect(() => () => { registerFlush(null); if (timer.current) { clearTimeout(timer.current); void saveNow.current() } }, [])
  const set = (d: PageDraft) => { setDraft(d); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(save, 800) }
  const t: PageTemplate = page.template
  const asSection = { id: page.id, key: 'design', hidden: false, scheme: 'paper', label: '', design: t, fill: Object.fromEntries(Object.entries(draft.fill).filter(([, f]) => f.kind !== 'faq')) } as SectionOf<'design'>
  const faq = Object.hasOwn(draft.fill, FAQ_ID) && draft.fill[FAQ_ID]!.kind === 'faq' ? (draft.fill[FAQ_ID] as { items: FaqItem[] }).items : FAQ_DEFAULT.map((i) => (i.bound ? { q: i.q, bound: i.bound } : { q: i.q, a: '' }))
  const remove = async () => {
    if (timer.current) { clearTimeout(timer.current); await save() }
    const r = await removePageAction({ id: page.id, version: version.current })
    if (!r.ok) { refused(r.error); return }
    onRemoved(page.id, r.gone ? null : r.version ?? null)
  }
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">{draft.title || TEMPLATE_NAMES[t]}</h2>
      <div className="space-y-1.5">
        <Text label="Title" value={draft.title} max={60} onChange={(title) => set({ ...draft, title, ...(!page.fixed && draft.handle === handleOf(draft.title) ? { handle: handleOf(title) } : {}) })} />
        {page.fixed
          ? <p className="font-mono text-xs text-muted-foreground">{address}/pages/{draft.handle}</p>
          : <label className="flex items-center gap-1 font-mono text-xs text-muted-foreground">{address}/pages/<input aria-label="Address" value={draft.handle} maxLength={60} onChange={(e) => set({ ...draft, handle: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} className="min-w-0 flex-1 rounded border border-input bg-card px-1.5 py-0.5" /></label>}
      </div>
      <Switch label="Hide from the shop" on={draft.hidden} onChange={(hidden) => set({ ...draft, hidden })} />
      <DesignForm s={asSection} c={{ ...c, labels: false }} d={TEMPLATES[t]} set={(s) => set({ ...draft, fill: { ...(s.fill as Record<string, PageFill>), ...(t === 'faq' ? { [FAQ_ID]: { kind: 'faq' as const, items: faq } } : {}) } })} />
      {t === 'faq' && <Questions items={faq} answers={answers} set={(items) => set({ ...draft, fill: { ...draft.fill, [FAQ_ID]: { kind: 'faq', items } } })} />}
      <button type="button" onClick={remove} className="min-h-9 text-sm text-danger-text underline underline-offset-4">Remove page</button>
    </div>
  )
}

/** Add a page: About (may repeat) or FAQ (one), as pictures drawn from their blocks. */
export function AddPage({ open, onClose, onAdded, hasFaq, count, thumbs }: { open: boolean; onClose: () => void; onAdded: (p: EditorPage) => void; hasFaq: boolean; count: number; thumbs: Record<PageTemplate, React.ReactNode> }) {
  const [error, setError] = useState<string | null>(null)
  const add = async (template: PageTemplate) => {
    const r = await addPageAction({ template })
    if (!r.ok) { setError(r.error); return }
    onAdded({ id: r.id, template, version: r.version, draft: { title: template === 'faq' ? 'Questions, answered' : 'Our story', handle: r.handle, fill: {}, hidden: false }, fixed: false, dirty: true })
  }
  const full = count >= 20
  return (
    <Dialog open={open} onClose={onClose} title="Add a page" error={error} actions={<><span className="mr-auto self-center font-mono text-xs text-muted-foreground">{count} of 20</span><button type="button" data-autofocus onClick={onClose} className="min-h-10 rounded-md border border-input px-4 text-sm">Close</button></>}>
      <ul className="grid gap-3 sm:grid-cols-2">
        {(['about', 'faq'] as const).map((t) => {
          const off = full || (t === 'faq' && hasFaq)
          return (
            <li key={t}><button type="button" disabled={off} onClick={() => add(t)} className="w-full overflow-hidden rounded-xl border border-border bg-card text-left hover:border-input disabled:opacity-50">
              <span className="block bg-muted text-foreground">{thumbs[t]}</span>
              <span className="block space-y-1 p-3"><span className="flex items-center gap-2 font-semibold">{TEMPLATE_NAMES[t]}{t === 'faq' && hasFaq && <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Already added</span>}</span>
                <span className="block text-sm text-muted-foreground">{TEMPLATES[t].line}</span></span>
            </button></li>
          )
        })}
      </ul>
    </Dialog>
  )
}
