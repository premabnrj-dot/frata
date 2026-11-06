'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LeaveDialog, Message, SaveBar, useLeaveGuard } from '@/components/ui/unsaved'
import { readiness } from '@/domains/catalogue/product-form'
import { combinations, keyOf, skuFor, type Option } from '@/domains/catalogue/variants'
import { Money } from '@/components/data/numeric'
import { paise } from '@/domains/money/paise'
import { parseRupees } from '@/domains/catalogue/product-form'
import { pick, urlFor } from '@/domains/media/sizes'
import { saveProduct, setPublished } from '../actions'
import { OptionsEditor } from './options-editor'
import { Photos, type Photo } from './photos'
import { SizeChartPanel, type TypeRow } from './size-chart'
import { EMPTY_CELL, VariantGrid, type Cell } from './variant-grid'

export type EditorProduct = {
  id: string; title: string; description: string; typeId: string | null; modelHeight: string; modelSize: string
  options: Option[]; cells: Record<string, Cell>; version: number; published: boolean
  handle: string; skuPrefix: string; shopAddress: string
}

type Draft = Omit<EditorProduct, 'id' | 'version' | 'published' | 'handle' | 'skuPrefix' | 'shopAddress'>

/** One product: photos (saved as added), then everything else under one Save, and Show on shop once it is ready. */
export function ProductEditor({ initial, photos, types, tenantId, blobReady }: { initial: EditorProduct; photos: Photo[]; types: TypeRow[]; tenantId: string; blobReady: boolean }) {
  const router = useRouter()
  const start0: Draft = { title: initial.title, description: initial.description, typeId: initial.typeId, modelHeight: initial.modelHeight, modelSize: initial.modelSize, options: initial.options, cells: initial.cells }
  const [saved, setSaved] = useState(start0)
  const [d, setD] = useState(start0)
  const [version, setVersion] = useState(initial.version)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [conflict, setConflict] = useState(false)
  const [pending, start] = useTransition()
  const dirty = JSON.stringify(d) !== JSON.stringify(saved)
  const guard = useLeaveGuard(dirty)
  const set = (patch: Partial<Draft>) => { setD((x) => ({ ...x, ...patch })); setMsg(null) }

  const combos = useMemo(() => combinations(d.options.filter((o) => o.name.trim() && o.values.length)), [d.options])
  const type = types.find((t) => t.id === d.typeId)
  const colourIdx = d.options.findIndex((o) => /^colou?rs?$/i.test(o.name))
  const ready = readiness({
    title: d.title, photos: photos.length,
    prices: combos.map((c) => Number((d.cells[keyOf(c)] ?? EMPTY_CELL).price.replace(/[,₹\s]/g, '')) || 0),
    hasSizes: d.options.some((o) => /^sizes?$/i.test(o.name)), chartRows: type?.sizeChart.rows.length ?? 0,
    anyStock: combos.some((c) => (Number((d.cells[keyOf(c)] ?? EMPTY_CELL).stock) || 0) > 0),
  })
  const allReady = ready.every((r) => r.ok)

  function save() {
    start(async () => {
      const r = await saveProduct(initial.id, version, {
        title: d.title, description: d.description, typeId: d.typeId, modelHeight: d.modelHeight, modelSize: d.modelSize, options: d.options,
        variants: combos.map((c) => ({ values: c, ...(d.cells[keyOf(c)] ?? EMPTY_CELL) })),
      })
      if (r.ok) { setSaved(d); setVersion(r.version); setErrors({}); setConflict(false); setMsg({ tone: 'ok', text: initial.published ? 'Saved. Your shop shows it now.' : 'Saved.' }); router.refresh(); return }
      setErrors(r.errors ?? {}); setConflict(!!r.conflict); setMsg({ tone: 'error', text: r.error })
    })
  }
  const publish = (on: boolean) => start(async () => {
    const r = await setPublished(initial.id, on)
    setMsg(r.ok ? { tone: 'ok', text: on ? 'It is on your shop now.' : 'Hidden from your shop.' } : { tone: 'error', text: r.error })
    if (r.ok) router.refresh()
  })

  const box = 'space-y-3 rounded-md border border-border bg-card p-4'
  return (
    <div>
      {dirty && <SaveBar pending={pending} onSave={save} onDiscard={() => { setD(saved); setErrors({}); setMsg(null) }} />}
      <Link href="/console/products" className="text-sm text-muted-foreground hover:text-foreground">← Products</Link>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 flex-1">
          <label htmlFor="title" className="sr-only">Product title</label>
          <input id="title" value={d.title} maxLength={140} aria-invalid={!!errors.title || undefined} placeholder="Product title" onChange={(e) => set({ title: e.target.value })}
            className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 -mx-2 text-2xl font-bold tracking-tight transition-colors duration-fast hover:border-input focus:border-input focus:bg-card aria-invalid:border-danger-text" />
        </h1>
        <Badge tone={initial.published ? 'ok' : 'neutral'}>{initial.published ? 'On your shop' : 'Hidden'}</Badge>
      </div>
      {errors.title && <p className="text-sm text-danger-text">{errors.title}</p>}
      <Message m={msg} onReload={conflict ? () => window.location.reload() : undefined} />
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          <section className={box}>
            <div className="space-y-1"><label htmlFor="desc" className="block font-semibold">Description <span className="text-sm font-normal text-muted-foreground">(optional)</span></label>
              <textarea id="desc" rows={4} maxLength={5000} value={d.description} onChange={(e) => set({ description: e.target.value })} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm" placeholder="Fabric, fit, care. Shoppers read this before the size chart." /></div>
          </section>
          <section className={box}><h2 className="font-semibold">Photos</h2><Photos productId={initial.id} tenantId={tenantId} photos={photos} colours={colourIdx >= 0 ? d.options[colourIdx]!.values : []} enabled={blobReady} /></section>
          <section className={box}>
            <h2 className="font-semibold">Sizes and colours</h2>
            <OptionsEditor options={d.options} onChange={(options) => set({ options })} error={errors.options} />
            {combos.length > 0 && <VariantGrid options={d.options.filter((o) => o.name.trim() && o.values.length)} cells={d.cells} errors={errors} autoSku={(values) => skuFor(initial.skuPrefix, initial.handle, values)}
              onChange={(k, patch) => { setD((x) => ({ ...x, cells: { ...x.cells, [k]: { ...(x.cells[k] ?? EMPTY_CELL), ...patch } } })); setMsg(null) }} />}
          </section>
          <section className={box}><h2 className="font-semibold">Size chart</h2><SizeChartPanel types={types} typeId={d.typeId} onType={(typeId) => set({ typeId })} /></section>
          <section className={box}>
            <h2 className="font-semibold">The model in the photos</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><label htmlFor="mh" className="block text-sm font-medium">Height <span className="font-normal text-muted-foreground">(optional)</span></label><input id="mh" value={d.modelHeight} maxLength={30} placeholder="5 ft 6 in" onChange={(e) => set({ modelHeight: e.target.value })} className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm" /></div>
              <div className="space-y-1"><label htmlFor="ms" className="block text-sm font-medium">Wears <span className="font-normal text-muted-foreground">(optional)</span></label><input id="ms" value={d.modelSize} maxLength={10} placeholder="S" onChange={(e) => set({ modelSize: e.target.value })} className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm" /></div>
            </div>
            <p className="text-xs text-muted-foreground">Shown under the photos: shoppers judge their size by it.</p>
          </section>
        </div>
        <aside className="space-y-3 lg:sticky lg:top-16">
          <Summary d={d} photos={photos} typeName={type?.name ?? null} published={initial.published} address={`${initial.shopAddress}/products/${initial.handle}`} combos={combos} />
          <section className={box}>
            <h2 className="font-semibold">{initial.published ? 'On your shop' : 'Ready to show?'}</h2>
            <ul className="space-y-1 text-sm">{ready.map((r) => <li key={r.label} className={r.ok ? 'text-ok-text' : 'text-warn-text'}>{r.ok ? '✓' : '•'} {r.label}</li>)}</ul>
            {initial.published
              ? <Button variant="secondary" className="w-full" disabled={pending} onClick={() => publish(false)}>Hide from shop</Button>
              : <Button className="w-full" disabled={pending || dirty || !allReady} onClick={() => publish(true)} title={dirty ? 'Save your changes first' : undefined}>Show on my shop</Button>}
            {dirty && !initial.published && <p className="text-xs text-muted-foreground">Save your changes first.</p>}
            {!allReady && !initial.published && <p className="text-xs text-muted-foreground">Shoppers see it once everything above is ticked.</p>}
          </section>
        </aside>
      </div>
      {guard.leaveTo && <LeaveDialog what={saved.title || 'this product'} onStay={guard.stay} onLeave={() => guard.leave(() => setSaved(d))} />}
    </div>
  )
}

/** What the product is right now, at a glance: cover, where it shows, price range, stock. Follows the draft as you type. */
function Summary({ d, photos, typeName, published, address, combos }: { d: Draft; photos: Photo[]; typeName: string | null; published: boolean; address: string; combos: string[][] }) {
  const cells = combos.map((c) => d.cells[keyOf(c)] ?? EMPTY_CELL)
  const prices = cells.map((c) => parseRupees(c.price)).filter((x): x is number => x !== null && x > 0)
  const stocks = cells.map((c) => Number(c.stock) || 0)
  const total = stocks.reduce((a, b) => a + b, 0)
  const soldOut = stocks.filter((x) => x === 0).length
  const cover = photos[0]
  return (
    <section aria-label="Summary" className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex gap-3 p-4">
        {cover ? <img src={urlFor(cover.base, pick(cover.widths, 160))} alt="" width={64} height={80} className="h-20 w-16 shrink-0 rounded-sm bg-muted object-cover" />
          : <div className="grid h-20 w-16 shrink-0 place-items-center rounded-sm bg-muted text-[11px] text-muted-foreground">No photo</div>}
        <div className="min-w-0 space-y-1">
          <p className="truncate font-semibold">{d.title || 'Untitled product'}</p>
          <Badge tone={published ? 'ok' : 'neutral'}>{published ? 'On your shop' : 'Hidden'}</Badge>
          {typeName && <p className="text-xs text-muted-foreground">{typeName}</p>}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-px border-t border-border bg-border text-sm">
        <div className="bg-card p-3"><dt className="text-xs text-muted-foreground">Price</dt><dd>{prices.length ? (Math.min(...prices) === Math.max(...prices) ? <Money paise={paise(prices[0]!)} /> : <><Money paise={paise(Math.min(...prices))} />–<Money paise={paise(Math.max(...prices))} /></>) : <span className="text-muted-foreground">Not set</span>}</dd></div>
        <div className="bg-card p-3"><dt className="text-xs text-muted-foreground">In stock</dt><dd className="font-mono">{total}</dd></div>
        <div className="bg-card p-3"><dt className="text-xs text-muted-foreground">Sizes and colours</dt><dd className="font-mono">{combos.length}</dd></div>
        <div className="bg-card p-3"><dt className="text-xs text-muted-foreground">Sold out</dt><dd className={soldOut ? 'font-mono text-warn-text' : 'font-mono'}>{soldOut}</dd></div>
      </dl>
      <p className="truncate border-t border-border px-4 py-2 font-mono text-xs text-muted-foreground" title={address}>{address}</p>
    </section>
  )
}
