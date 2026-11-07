'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { LeaveDialog, Message, SaveBar, useLeaveGuard } from '@/components/ui/unsaved'
import { Money } from '@/components/data/numeric'
import type { Status } from '@/domains/catalogue/availability'
import { parseRupees, readiness, type ColourInput } from '@/domains/catalogue/product-form'
import { defaultDescription, defaultTitle } from '@/domains/catalogue/seo'
import { combinations, handleFor, keyOf, skuFor, type Option } from '@/domains/catalogue/variants'
import { paise } from '@/domains/money/paise'
import { pick, urlFor } from '@/domains/media/sizes'
import { saveProduct } from '../actions'
import { ColoursPanel, Swatch, type Family } from './colours-panel'
import { DetailsPanel } from './details-panel'
import { OptionsEditor } from './options-editor'
import { OrganiseCard, type CollectionChip, type PickedCategory } from './organise-card'
import { Photos, type Photo } from './photos'
import { SeoPanel } from './seo-panel'
import { SizeChartPanel, type TypeRow } from './size-chart'
import { StatusBadge } from './status-badge'
import { StatusCard } from './status-card'
import { EMPTY_CELL, shopperSees, VariantGrid, type Cell } from './variant-grid'

export type EditorProduct = {
  id: string; title: string; description: string; typeId: string | null; modelHeight: string; modelSize: string
  options: Option[]; cells: Record<string, Cell>; version: number
  status: Status; publishAt: string | null; everLive: boolean
  handle: string; seoTitle: string; seoDescription: string; tags: string[]
  category: PickedCategory | null; attributes: Record<string, string[]>; collections: string[]; colours: ColourInput[]
}
export type EditorShop = { name: string; address: string; skuPrefix: string; codOn: boolean; returnDays: number; returnKind: string; city: string | null }

type Draft = Omit<EditorProduct, 'id' | 'version' | 'status' | 'publishAt' | 'everLive'>
const isColour = (name: string) => /^colou?rs?$/i.test(name)

/**
 * One product. Main column in the order a merchant fills it (approved mockup,
 * 2026-11-06): description, photos, sizes and colours, details, size chart,
 * model, then Search and sharing (closed). Side: Status, Summary, Organise,
 * Ready for. Photos save as added; Status is its own action; the rest is one Save.
 */
export function ProductEditor({ initial, shop, photos, types, tenantId, blobReady, allCollections, families }: {
  initial: EditorProduct; shop: EditorShop; photos: Photo[]; types: TypeRow[]; tenantId: string; blobReady: boolean; allCollections: CollectionChip[]; families: Family[]
}) {
  const router = useRouter()
  const { id, version: v0, status, publishAt, everLive, ...start0 } = initial
  const [saved, setSaved] = useState<Draft>(start0)
  const [d, setD] = useState<Draft>(start0)
  const [version, setVersion] = useState(v0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [conflict, setConflict] = useState(false)
  const [pending, start] = useTransition()
  const dirty = JSON.stringify(d) !== JSON.stringify(saved)
  const guard = useLeaveGuard(dirty)
  const set = (patch: Partial<Draft>) => { setD((x) => ({ ...x, ...patch })); setMsg(null) }

  const opts = d.options.filter((o) => o.name.trim() && o.values.length)
  const combos = useMemo(() => combinations(opts), [d.options]) // eslint-disable-line react-hooks/exhaustive-deps
  const cells = combos.map((c) => d.cells[keyOf(c)] ?? EMPTY_CELL)
  const type = types.find((t) => t.id === d.typeId)
  const colourOpt = d.options.find((o) => isColour(o.name))
  const prices = cells.map((c) => parseRupees(c.price)).filter((x): x is number => x !== null && x > 0)
  const ready = readiness({
    title: d.title, photos: photos.length, prices: cells.map((c) => parseRupees(c.price) ?? 0),
    hasSizes: d.options.some((o) => /^sizes?$/i.test(o.name)), chartRows: type?.sizeChart.rows.length ?? 0,
    anyBuyable: cells.some((c) => shopperSees(c).canBuy),
  })

  // Defaults for search and sharing, from the product's own facts (seo.ts).
  const fabricId = d.attributes.fabric?.[0]
  const fabric = fabricId ? d.category?.attributes.find((a) => a.handle === 'fabric')?.values.find((v) => v.id === fabricId)?.name ?? null : null
  const defaults = {
    title: defaultTitle(d.title || 'Product', colourOpt?.values ?? [], shop.name),
    description: defaultDescription({ title: d.title || 'Product', fabric, minPrice: prices.length ? Math.min(...prices) : null, codOn: shop.codOn, returnDays: shop.returnDays, returnKind: shop.returnKind, city: shop.city }),
    handle: handleFor(d.title) || 'product',
  }

  function save() {
    start(async () => {
      const r = await saveProduct(id, version, {
        title: d.title, description: d.description, typeId: d.typeId, modelHeight: d.modelHeight, modelSize: d.modelSize, options: d.options,
        variants: combos.map((c) => ({ values: c, ...(d.cells[keyOf(c)] ?? EMPTY_CELL) })),
        handle: d.handle, seoTitle: d.seoTitle, seoDescription: d.seoDescription, categoryId: d.category?.id ?? null,
        attributes: d.attributes, colours: d.colours, tags: d.tags,
      }, d.collections)
      if (r.ok) {
        setSaved(d); setVersion(r.version); setErrors({}); setConflict(false)
        setMsg({ tone: 'ok', text: status === 'active' || status === 'unlisted' ? 'Saved. Your shop shows it now.' : 'Saved.' })
        if (r.handle !== initial.handle) router.replace(`/console/products/${r.handle}`)
        else router.refresh()
        return
      }
      setErrors(r.errors ?? {}); setConflict(!!r.conflict); setMsg({ tone: 'error', text: r.error })
    })
  }

  const box = 'space-y-3 rounded-md border border-border bg-card p-4'
  return (
    <div>
      {dirty && <SaveBar pending={pending} onSave={save} onDiscard={() => { setD(saved); setErrors({}); setMsg(null) }} />}
      <Link href="/console/products" className="text-sm text-muted-foreground hover:text-foreground">← Products</Link>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 flex-1">
          <label htmlFor="title" className="sr-only">Product title</label>
          <input id="title" value={d.title} maxLength={140} aria-invalid={!!errors.title || undefined} placeholder="Product title" onChange={(e) => set({ title: e.target.value })}
            className="-mx-2 w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-2xl font-bold tracking-tight transition-colors duration-fast hover:border-input focus:border-input focus:bg-card aria-invalid:border-danger-text" />
        </h1>
        <StatusBadge status={status} publishAt={publishAt} />
      </div>
      {errors.title && <p className="text-sm text-danger-text">{errors.title}</p>}
      <Message m={msg} onReload={conflict ? () => window.location.reload() : undefined} />
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <section className={box}>
            <label htmlFor="desc" className="block font-semibold">Description <span className="text-sm font-normal text-muted-foreground">(optional)</span></label>
            <textarea id="desc" rows={4} maxLength={5000} value={d.description} onChange={(e) => set({ description: e.target.value })} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm" placeholder="Fabric, fit, care. Shoppers read this before the size chart." />
          </section>
          <section className={box}><h2 className="font-semibold">Photos</h2><Photos productId={id} tenantId={tenantId} photos={photos} colours={colourOpt?.values ?? []} enabled={blobReady} /></section>
          <section className={box}>
            <div><h2 className="font-semibold">Sizes, colours and stock</h2><p className="text-xs text-muted-foreground">Price, stock and SKU live here; what shoppers see is worked out from them.</p></div>
            <OptionsEditor options={d.options} onChange={(options) => set({ options })} error={errors.options} />
            {colourOpt && colourOpt.values.length > 0 && <ColoursPanel values={colourOpt.values} colours={d.colours} onChange={(colours) => set({ colours })} photos={photos} families={families} />}
            {combos.length > 0 && <VariantGrid options={opts} cells={d.cells} errors={errors} autoSku={(values) => skuFor(shop.skuPrefix, d.handle || defaults.handle, values)}
              onChange={(k, patch) => { setD((x) => ({ ...x, cells: { ...x.cells, [k]: { ...(x.cells[k] ?? EMPTY_CELL), ...patch } } })); setMsg(null) }} />}
          </section>
          <section className={box}>
            <div><h2 className="font-semibold">Details</h2>{d.category && <p className="text-xs text-muted-foreground">Asked for by its category, {d.category.name}.</p>}</div>
            <DetailsPanel attributes={d.category?.attributes ?? []} values={d.attributes} onChange={(attributes) => set({ attributes })} />
          </section>
          <section className={box}><h2 className="font-semibold">Size chart</h2><SizeChartPanel types={types} typeId={d.typeId} onType={(typeId) => set({ typeId })} /></section>
          <section className={box}>
            <h2 className="font-semibold">The model in the photos</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><label htmlFor="mh" className="block text-sm font-medium">Height <span className="font-normal text-muted-foreground">(optional)</span></label><input id="mh" value={d.modelHeight} maxLength={30} placeholder="5 ft 6 in" onChange={(e) => set({ modelHeight: e.target.value })} className="h-10 md:h-9 w-full rounded-md border border-input bg-card px-3 text-sm" /></div>
              <div className="space-y-1"><label htmlFor="ms" className="block text-sm font-medium">Wears <span className="font-normal text-muted-foreground">(optional)</span></label><input id="ms" value={d.modelSize} maxLength={10} placeholder="S" onChange={(e) => set({ modelSize: e.target.value })} className="h-10 md:h-9 w-full rounded-md border border-input bg-card px-3 text-sm" /></div>
            </div>
            <p className="text-xs text-muted-foreground">Shown under the photos: shoppers judge their size by it.</p>
          </section>
          <SeoPanel handle={d.handle} onHandle={(handle) => set({ handle })} seoTitle={d.seoTitle} onSeoTitle={(seoTitle) => set({ seoTitle })} seoDescription={d.seoDescription} onSeoDescription={(seoDescription) => set({ seoDescription })}
            defaults={defaults} address={shop.address} cover={photos[0]} everLive={everLive} errors={errors} />
        </div>
        <aside className="space-y-3">
          <StatusCard productId={id} status={status} publishAt={publishAt} ready={ready} dirty={dirty} />
          <Summary d={d} cells={cells} photos={photos} typeName={type?.name ?? null} status={status} publishAt={publishAt} address={`${shop.address}/products/${d.handle || defaults.handle}`} />
          <OrganiseCard category={d.category} onCategory={(category) => set({ category, attributes: {} })} collections={allCollections} picked={d.collections} onPicked={(collections) => set({ collections })} tags={d.tags} onTags={(tags) => set({ tags })} />
          <ReadyFor d={d} photos={photos.length} priced={prices.length === cells.length && cells.length > 0} />
        </aside>
      </div>
      {guard.leaveTo && <LeaveDialog what={saved.title || 'this product'} onStay={guard.stay} onLeave={() => guard.leave(() => setSaved(d))} />}
    </div>
  )
}

/** The product right now, following the draft: cover, status, price range, what can be bought. */
function Summary({ d, cells, photos, typeName, status, publishAt, address }: { d: Draft; cells: Cell[]; photos: Photo[]; typeName: string | null; status: Status; publishAt: string | null; address: string }) {
  const prices = cells.map((c) => parseRupees(c.price)).filter((x): x is number => x !== null && x > 0)
  const total = cells.reduce((a, c) => a + (Number(c.stock) || 0), 0)
  const sees = cells.map((c) => shopperSees(c))
  const soldOut = sees.filter((s) => !s.canBuy).length
  const later = sees.filter((s) => s.kind === 'preorder' || s.kind === 'made_to_order').length
  const cover = photos[0]
  const colourOpt = d.options.find((o) => isColour(o.name))
  return (
    <section aria-label="Summary" className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex gap-3 p-4">
        {cover ? <img src={urlFor(cover.base, pick(cover.widths, 160))} alt="" width={64} height={80} className="h-20 w-16 shrink-0 rounded-sm bg-muted object-cover" />
          : <div className="grid h-20 w-16 shrink-0 place-items-center rounded-sm bg-muted text-[11px] text-muted-foreground">No photo</div>}
        <div className="min-w-0 space-y-1">
          <p className="truncate font-semibold">{d.title || 'Untitled product'}</p>
          <StatusBadge status={status} publishAt={publishAt} />
          <p className="truncate text-xs text-muted-foreground">{[d.category?.name, typeName].filter(Boolean).join(' · ')}</p>
          {colourOpt && colourOpt.values.length > 0 && (
            <ul className="flex flex-wrap gap-1" aria-label="Colours">{colourOpt.values.map((v) => <li key={v} title={v}><Swatch c={d.colours.find((c) => c.value === v) ?? { value: v, family: null, hex: null, crop: null }} photos={photos} d={18} /><span className="sr-only">{v}</span></li>)}</ul>
          )}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-px border-t border-border bg-border text-sm">
        <div className="bg-card p-3"><dt className="text-xs text-muted-foreground">Price</dt><dd>{prices.length ? (Math.min(...prices) === Math.max(...prices) ? <Money paise={paise(prices[0]!)} /> : <><Money paise={paise(Math.min(...prices))} />–<Money paise={paise(Math.max(...prices))} /></>) : <span className="text-muted-foreground">Not set</span>}</dd></div>
        <div className="bg-card p-3"><dt className="text-xs text-muted-foreground">In stock</dt><dd className="font-mono">{total}</dd></div>
        <div className="bg-card p-3"><dt className="text-xs text-muted-foreground">Sold out</dt><dd className={soldOut ? 'font-mono text-warn-text' : 'font-mono'}>{soldOut} of {cells.length}</dd></div>
        <div className="bg-card p-3"><dt className="text-xs text-muted-foreground">Pre-order or made to order</dt><dd className="font-mono">{later}</dd></div>
      </dl>
      <div className="flex items-center gap-2 border-t border-border px-4 py-2 text-xs">
        <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground" title={address}>{address}</span>
        <Link href={`/console/preview/products/${address.split('/products/')[1] ?? ''}`} className="shrink-0 underline">Preview</Link>
      </div>
    </section>
  )
}

/** Whether Google and Meta will take it, in words: what their feeds need that is still missing. */
function ReadyFor({ d, photos, priced }: { d: Draft; photos: number; priced: boolean }) {
  const has = (h: string) => (d.attributes[h]?.length ?? 0) > 0
  const asks = (h: string) => d.category?.attributes.some((a) => a.handle === h) ?? false
  const needs = [
    { label: 'A category', ok: !!d.category },
    { label: 'Who it is for (gender)', ok: !asks('target-gender') || has('target-gender') },
    { label: 'Age group', ok: !asks('age-group') || has('age-group') },
    { label: 'A photo', ok: photos > 0 },
    { label: 'Prices', ok: priced },
    { label: 'A colour family for each colour', ok: !d.options.some((o) => isColour(o.name)) || (d.options.find((o) => isColour(o.name))!.values.every((v) => d.colours.some((c) => c.value === v && c.family))) },
  ]
  const missing = needs.filter((n) => !n.ok)
  return (
    <section aria-labelledby="ready-h" className="space-y-2 rounded-md border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2"><h2 id="ready-h" className="font-semibold">Ready for</h2><Badge tone={missing.length ? 'warn' : 'ok'}>{missing.length ? `${missing.length} to add` : 'Google and Meta'}</Badge></div>
      {missing.length ? <ul className="space-y-0.5 text-sm text-warn-text">{missing.map((m) => <li key={m.label}><span aria-hidden="true">• </span>{m.label}</li>)}</ul>
        : <p className="text-sm text-muted-foreground">Google Shopping and Meta catalogues will accept it once those channels are connected.</p>}
    </section>
  )
}
