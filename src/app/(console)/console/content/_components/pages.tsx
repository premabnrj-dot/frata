'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Section } from '@/components/layout/section'
import { Badge, Tag } from '@/components/ui/badge'
import { Button, button } from '@/components/ui/button'
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
import { addPageAction, previewOnWebsiteAction, savePageAction, undoPageAction } from '../actions'
import { CopyField } from '@/components/ui/copy-field'
import { Eye, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import type { PreviewKey } from '@/lib/queries/storefront-api'
import type { Target } from './link-select'

// =============================================================================
// Content › Pages (final mockup § Pages): About and the store's other pages (the FAQ has its own tab). A page's words
// and photos are the template's fields (the same form the Look used, TS1a); Save is live, with Undo for a minute. The
// address is set when it is added and never moves (lib/themes/pages.ts fixedHandle). A page with example words still to write can't be shown.
// =============================================================================

export type PageRowView = { id: string; version: number; template: PageTemplate; draft: PageDraft; shown: boolean }
type Ctx = { tenantId: string; targets: Target[]; collections: { handle: string; title: string }[]; products: { handle: string; title: string }[]; photos: LibraryPhoto[]; shopName: string }
const MAX_PAGES = 20

/** Preview on website (SA1b D·4, mockup § Preview): the store's own website and the keys a preview may name; null when
 *  the store runs on Frrata or previews aren't set up. */
export type PreviewSetup = { keys: (PreviewKey & { used: string | null })[] } | null

export function Pages({ pages, canSave, lock, ctx, templates, preview = null }: { pages: PageRowView[]; canSave: boolean; lock: string | null; ctx: Ctx; templates: Record<'about', Design>; preview?: PreviewSetup }) {
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
  // Preview on website: pick the key when there are several, then the link once (never stored, never a toast).
  const [pv, setPv] = useState<{ page: PageRowView; step: 'pick' | 'link' | 'refused'; keyId: string | null; url?: string; host?: string; error?: string } | null>(null)
  const openPreview = async (page: PageRowView, keyId: string | null) => {
    if (!preview) return
    if (!keyId && preview.keys.length > 1) { setPv({ page, step: 'pick', keyId: preview.keys[0]!.id }); return }
    setBusy(true)
    const r = await previewOnWebsiteAction({ entry: `page:${page.draft.handle}`, ...(keyId ? { keyId } : {}) })
    setBusy(false)
    setPv(r.ok ? { page, step: 'link', keyId, url: r.url, host: r.host } : { page, step: 'refused', keyId, error: r.error })
  }
  const close = () => { setEdit(null); setAdding(null); setError(null); setPv(null) }
  const err = (f: string) => (error?.field === f ? error.text : null)
  const asSection = (p: PageRowView) => ({ id: p.id, key: 'design', hidden: false, scheme: 'paper', label: '', design: p.template, fill: p.draft.fill }) as unknown as SectionOf<'design'>

  return (
    <Section ariaLabel="Pages" title={!pages.length ? 'Pages' : <span className="flex items-center gap-2">Pages <Tag className="font-num">{pages.length} of {MAX_PAGES}</Tag></span>}
      action={!pages.length ? (canSave ? null : lock ? <Badge>{lock}</Badge> : null) : canSave ? <Button size="sm" variant="secondary" disabled={pages.length >= MAX_PAGES} onClick={() => setAdding({ title: '', handle: '', touched: false })}>Add a page</Button> : lock ? <Badge>{lock}</Badge> : null}>
      {pages.length
        ? <ul data-list className="divide-y divide-line-soft">{pages.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1"><p className="truncate font-medium">{p.draft.title}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-label text-muted-foreground"><span className="font-mono text-small">/pages/{p.draft.handle}</span><Badge tone={p.shown ? 'ok' : 'neutral'}>{p.shown ? 'Shown' : 'Hidden'}</Badge></p></div>
            {canSave && preview && !p.shown ? <Button size="sm" variant="ghost" busy={busy && pv === null} onClick={() => openPreview(p, null)}><Eye aria-hidden="true" className="size-4" /><span className="max-md:sr-only">Preview on website</span></Button> : null}
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

      {/* Preview on website (mockup § Preview: 1 the key, 2 the link, 3 refused). */}
      <Dialog open={pv?.step === 'pick'} onClose={close} title={pv ? `Preview ${pv.page.draft.title}` : ''}
        actions={<><Button variant="secondary" data-autofocus onClick={close}>Cancel</Button><Button busy={busy} onClick={() => pv && openPreview(pv.page, pv.keyId)}>Open preview</Button></>}>
        {pv && preview ? <fieldset className="grid gap-2"><legend className="mb-2 text-label font-medium">Key your website uses</legend>
          {preview.keys.map((k) => (
            <label key={k.id} className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-0.5 rounded-md border border-field px-3 py-2.5 has-[:checked]:border-2 has-[:checked]:border-primary has-[:checked]:bg-select">
              <input type="radio" name="preview-key" checked={pv.keyId === k.id} onChange={() => setPv({ ...pv, keyId: k.id })} className="mt-1 size-4 accent-[var(--action)]" />
              <span className="font-medium">{k.name}</span>
              <span className="col-start-2 text-small text-muted-foreground"><span className="font-mono">{k.prefix}…</span>{k.used ? ` · ${k.used}` : ''}</span>
            </label>))}
        </fieldset> : null}
      </Dialog>
      <Dialog open={pv?.step === 'link'} onClose={close} title={pv ? `Preview of ${pv.page.draft.title}` : ''}
        actions={<><Button variant="secondary" onClick={close}>Close</Button>{pv?.url ? <a href={pv.url} target="_blank" rel="noopener noreferrer" data-autofocus className={button()}><ExternalLink aria-hidden="true" className="size-4" />Open {pv.host}</a> : null}</>}>
        {pv?.url ? <div className="grid gap-2"><CopyField value={pv.url} label="preview link" /><p className="text-small text-muted-foreground">The link works for 10 minutes.</p></div> : null}
      </Dialog>
      <Dialog open={pv?.step === 'refused'} onClose={close} title="Couldn’t open the preview" error={pv?.error ?? null}
        actions={<><Button variant="secondary" data-autofocus onClick={close}>Close</Button>{pv?.error?.includes('Settings › Website') ? <Link href="/console/settings/website" className={button()}>Open Settings › Website</Link> : null}</>}>
        {null}
      </Dialog>

      <Dialog open={!!adding} onClose={close} title="Add a page" error={error && !error.field ? error.text : null}
        actions={<><Button variant="secondary" data-autofocus onClick={close}>Don’t add</Button><Button busy={busy} onClick={add}>Add page</Button></>}>
        {adding && <div className="grid gap-4">
          {/* The one page a store adds (TS1a templates: the FAQ has its own tab). */}
          <div className="flex items-center gap-3 rounded-md border border-border p-3"><span aria-hidden="true" className="size-12 shrink-0 rounded-md bg-sunk" />
            <span className="min-w-0 flex-1"><b className="block font-medium">About</b><span className="block text-label text-muted-foreground">Story, makers, materials</span></span>
            <Button size="sm" variant="secondary" onClick={() => document.querySelector<HTMLInputElement>('input[name="title"]')?.focus()}>Add About</Button></div>
          <label className="grid gap-1.5"><span className="flex justify-between text-label font-medium">Title<span className="font-num font-normal text-muted-foreground">{adding.title.length}/60</span></span>
            <input name="title" value={adding.title} maxLength={60} placeholder="Our story" {...fieldProps('title', err('title'))} onChange={(e) => setAdding({ ...adding, title: e.target.value, handle: adding.touched ? adding.handle : handleOf(e.target.value) })} className={`${FIELD} w-full`} />
            <FieldError name="title" message={err('title')} /></label>
          <label className="grid gap-1.5"><span className="text-label font-medium">Address</span>
            <span className={`${FIELD} flex w-full items-center focus-within:ring-2 focus-within:ring-ring`}><span aria-hidden="true" className="font-mono text-small text-muted-foreground">/pages/</span>
              <input name="handle" value={adding.handle} maxLength={60} {...fieldProps('handle', err('handle'))} onChange={(e) => setAdding({ ...adding, touched: true, handle: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} className="min-w-0 flex-1 bg-transparent font-mono text-small outline-none" /></span>
            <FieldError name="handle" message={err('handle')} /></label>
        </div>}
      </Dialog>
    </Section>
  )
}
