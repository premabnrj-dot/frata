'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Section } from '@/components/layout/section'
import { Badge, Tag } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FIELD } from '@/components/ui/field'
import { FieldError, fieldProps } from '@/components/ui/field-error'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { handleOf, type PageDraft, type PageFill, type PageTemplate } from '@/domains/pages/templates'
import type { Design } from '@/domains/themes/blocks'
import type { SectionOf } from '@/domains/themes/sections'
import { DesignForm } from '@/app/(lookeditor)/console/look/customize/design-form'
import type { FormCtx } from '@/app/(lookeditor)/console/look/customize/section-form'
import type { LibraryPhoto } from '@/app/(lookeditor)/console/look/customize/controls'
import { addPageAction, savePageAction, undoPageAction } from '../actions'
import type { Target } from './link-select'

// =============================================================================
// Content › Pages (final mockup § Pages): About and the store's other pages (the FAQ has its own tab). A page's words
// and photos are the template's fields (the same form the Look used, TS1a); Save is live, with Undo for a minute. The
// address is set when it is added and never moves (lib/themes/pages.ts fixedHandle). A page with example words still to write can't be shown.
// =============================================================================

export type PageRowView = { id: string; version: number; template: PageTemplate; draft: PageDraft; shown: boolean }
type Ctx = { tenantId: string; targets: Target[]; collections: { handle: string; title: string }[]; products: { handle: string; title: string }[]; photos: LibraryPhoto[]; shopName: string }
const MAX_PAGES = 20

export function Pages({ pages, canSave, lock, ctx, templates }: { pages: PageRowView[]; canSave: boolean; lock: string | null; ctx: Ctx; templates: Record<'about', Design> }) {
  const router = useRouter()
  const toast = useToast()
  const [edit, setEdit] = useState<PageRowView | null>(null)
  const [adding, setAdding] = useState<{ title: string; handle: string; touched: boolean } | null>(null)
  const [error, setError] = useState<{ text: string; field?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const form: FormCtx = { ...ctx, schemes: [], masks: ['none'], layouts: [], labels: false, promiseWords: {} as FormCtx['promiseWords'] }

  const save = async () => {
    if (!edit) return
    setBusy(true); setError(null)
    const r = await savePageAction({ id: edit.id, version: edit.version, draft: edit.draft })
    setBusy(false)
    if (!r.ok) { setError({ text: r.error, field: r.field }); return }
    setEdit(null)
    toast({ text: `${edit.draft.title} saved`, undo: async () => { const u = await undoPageAction({ id: r.id, version: r.version }); router.refresh(); return u } })
    router.refresh()
  }
  const add = async () => {
    if (!adding) return
    setBusy(true); setError(null)
    const r = await addPageAction({ title: adding.title, handle: adding.handle })
    setBusy(false)
    if (!r.ok) { setError({ text: r.error, field: r.field }); return }
    setAdding(null)
    toast.ok(`${adding.title} added`)
    router.refresh()
  }
  const close = () => { setEdit(null); setAdding(null); setError(null) }
  const err = (f: string) => (error?.field === f ? error.text : null)
  const asSection = (p: PageRowView) => ({ id: p.id, key: 'design', hidden: false, scheme: 'paper', label: '', design: p.template, fill: p.draft.fill }) as unknown as SectionOf<'design'>

  return (
    <Section ariaLabel="Pages" title={<span className="flex items-center gap-2">Pages <Tag className="font-num">{pages.length} of {MAX_PAGES}</Tag></span>}
      action={canSave ? <Button size="sm" variant="secondary" disabled={pages.length >= MAX_PAGES} onClick={() => setAdding({ title: '', handle: '', touched: false })}>Add a page</Button> : lock ? <Badge>{lock}</Badge> : null}>
      {pages.length
        ? <ul data-list className="divide-y divide-line-soft">{pages.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1"><p className="truncate font-medium">{p.draft.title}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-label text-muted-foreground"><span className="font-mono text-small">/pages/{p.draft.handle}</span><Badge tone={p.shown ? 'ok' : 'neutral'}>{p.shown ? 'Shown' : 'Hidden'}</Badge></p></div>
            <Button size="sm" variant="secondary" aria-label={`Edit ${p.draft.title}`} disabled={!canSave} onClick={() => setEdit(p)}>Edit</Button>
          </li>))}</ul>
        : <div className="grid justify-items-center gap-2 py-6 text-center"><p className="font-medium">No pages yet</p>{canSave && <Button onClick={() => setAdding({ title: '', handle: '', touched: false })}>Add a page</Button>}</div>}

      <Dialog open={!!edit} onClose={close} title={edit?.draft.title || 'Page'} error={error && !error.field ? error.text : null} className="md:max-w-xl"
        actions={<><Button variant="secondary" data-autofocus onClick={close}>Keep as it is</Button><Button busy={busy} onClick={save}>Save</Button></>}>
        {edit && <div className="grid gap-4">
          <label className="grid gap-1.5"><span className="flex justify-between text-label font-medium">Title<span className="font-num font-normal text-muted-foreground">{edit.draft.title.length}/60</span></span>
            <input value={edit.draft.title} maxLength={60} onChange={(e) => setEdit({ ...edit, draft: { ...edit.draft, title: e.target.value } })} className={`${FIELD} w-full`} /></label>
          <div className="grid gap-1.5"><span className="text-label font-medium">Address</span>
            <p className="flex items-center justify-between rounded-md border border-border bg-sunk px-3 py-2"><span className="font-mono text-small">/pages/{edit.draft.handle}</span><span className="text-label text-muted-foreground">Fixed</span></p>
          </div>
          {edit.template === 'about' && <DesignForm s={asSection(edit)} c={form} d={templates.about} set={(s) => setEdit({ ...edit, draft: { ...edit.draft, fill: s.fill as Record<string, PageFill> } })} />}
          <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5"><span id={`show-${edit.id}`} className="text-sm">Show on your store</span>
            <Switch label="Show on your store" on={!edit.draft.hidden} onChange={(on) => setEdit({ ...edit, draft: { ...edit.draft, hidden: !on } })} /></div>
        </div>}
      </Dialog>

      <Dialog open={!!adding} onClose={close} title="Add a page" error={error && !error.field ? error.text : null}
        actions={<><Button variant="secondary" data-autofocus onClick={close}>Don’t add</Button><Button busy={busy} onClick={add}>Add page</Button></>}>
        {adding && <div className="grid gap-4">
          {/* The one page a store adds (TS1a templates: the FAQ has its own tab). */}
          <div className="flex items-center gap-3 rounded-md border border-border p-3"><span aria-hidden="true" className="size-12 shrink-0 rounded-md bg-sunk" />
            <span className="min-w-0 flex-1"><b className="block font-medium">About</b><span className="block text-label text-muted-foreground">Story, makers, materials</span></span></div>
          <label className="grid gap-1.5"><span className="flex justify-between text-label font-medium">Title<span className="font-num font-normal text-muted-foreground">{adding.title.length}/60</span></span>
            <input name="title" value={adding.title} maxLength={60} placeholder="Our story" {...fieldProps('title', err('title'))} onChange={(e) => setAdding({ ...adding, title: e.target.value, handle: adding.touched ? adding.handle : handleOf(e.target.value) })} className={`${FIELD} w-full`} />
            <FieldError name="title" message={err('title')} /></label>
          <label className="grid gap-1.5"><span className="text-label font-medium">Address</span>
            <span className="flex items-center gap-1"><span className="font-mono text-small text-muted-foreground">/pages/</span>
              <input name="handle" value={adding.handle} maxLength={60} {...fieldProps('handle', err('handle'))} onChange={(e) => setAdding({ ...adding, touched: true, handle: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} className={`${FIELD} min-w-0 flex-1 font-mono`} /></span>
            <FieldError name="handle" message={err('handle')} /></label>
        </div>}
      </Dialog>
    </Section>
  )
}
