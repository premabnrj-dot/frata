'use client'

import { isSizeOption } from '@/domains/storefront/picker'
import { colourIndex } from '@/domains/catalogue/option-kind'
import { InfoTip } from '@/components/ui/info-tip'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { LeaveDialog, SaveBar, useLeaveGuard } from '@/components/ui/unsaved'
import { FieldError, fieldProps, useErrorSummary } from '@/components/ui/field-error'
import { useToast } from '@/components/ui/toast'
import { Money } from '@/components/data/numeric'
import type { Status } from '@/domains/catalogue/availability'
import { readiness, type ColourInput } from '@/domains/catalogue/product-form'
import { parseRupees } from '@/domains/money/rupees'
import { defaultDescription, defaultTitle } from '@/domains/seo/defaults'
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
import { TaxPanel } from './tax-panel'
import { LabelPanel } from './label-panel'
import { PairsPanel, StoriesPanel } from './extras-panel'
import type { Piece, Story } from '@/domains/catalogue/stories'
import { labelMissing, readLabel, type LabelInput } from '@/domains/catalogue/label'
import type { TaxInput } from '@/domains/catalogue/product-form'
import { inGap, ruleOn } from '@/domains/tax/rates'
import { useNow } from '@/components/time/now'
import { EMPTY_CELL, shopperSees, VariantGrid, type Cell } from './variant-grid'
import { Section } from '@/components/layout/section'
import { FoldSection } from '@/components/layout/fold-section'
import { PageHeader } from '@/components/layout/page-header'

export type EditorProduct = {
  id: string; title: string; description: string; typeId: string | null; modelHeight: string; modelSize: string
  options: Option[]; cells: Record<string, Cell>; version: number
  status: Status; publishAt: string | null; everLive: boolean
  handle: string; seoTitle: string; seoDescription: string; tags: string[]
  category: PickedCategory | null; attributes: Record<string, string[]>; collections: string[]; colours: ColourInput[]
  tax: TaxInput
  label: LabelInput
  /** Signal S3: present only when the look offers the card or the product already has some (so it can be removed). */
  stories?: Story[]; pairs?: Piece[]
}
export type EditorShop = { name: string; address: string; skuPrefix: string; codOn: boolean; returnDays: number; returnKind: string; city: string | null
  /** Whether this viewer sees and sets the cost of goods (`seesCosts`): when false, the column is not there and a save keeps the stored cost. */
  costs: boolean
  /** GST: whether the shop charges it (regular scheme), and whether its prices include it. */
  gst: { charges: boolean; inclusive: boolean }
  /** What the shop sells: sized (clothing, footwear) shows the size chart and the model; label asks what the pack says. */
  sized: boolean; label: boolean
  /** The shop's legal name and address, for "We pack it". */
  maker: string }

type Draft = Omit<EditorProduct, 'id' | 'version' | 'status' | 'publishAt' | 'everLive'>

/**
 * One product. Main column in the order a merchant fills it (approved mockup,
 * 2026-11-06): description, photos, sizes and colours, details, size chart,
 * model, then Search and sharing (closed). Side: Status, Summary, Organise,
 * Ready for. Photos save as added; Status is its own action; the rest is one Save.
 */
export function ProductEditor({ initial, shop, photos, types, tenantId, blobReady, allCollections, families, share, video }: {
  initial: EditorProduct; shop: EditorShop; photos: Photo[]; types: TypeRow[]; tenantId: string; blobReady: boolean; allCollections: CollectionChip[]; families: Family[]
  /** The Share button (search and sharing S1·7), made on the server for this shop. */
  share?: React.ReactNode
  /** The Video card (PV·1), made on the server: it saves as it changes, outside the one Save. */
  video?: React.ReactNode
}) {
  const router = useRouter()
  const now = useNow()
  const { id, version: v0, status, publishAt, everLive, ...start0 } = initial
  const [saved, setSaved] = useState<Draft>(start0)
  const [d, setD] = useState<Draft>(start0)
  // Colour renames since the last save: photos tagged with the old name are retagged on the server (PR·0).
  const [renames, setRenames] = useState<{ from: string; to: string }[]>([])
  const [version, setVersion] = useState(v0)
  const toast = useToast()
  // The save's mistakes stay at their fields (keys as cleanProduct gives them: "title", "v:<values>:price", "tax.hsn",
  // "label.net", …); one summary toast counts them down as each is fixed, and focus goes to the first (§ Feedback 3).
  const root = useRef<HTMLDivElement>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [attempt, setAttempt] = useState(0)
  const [refusal, setRefusal] = useState<string | undefined>(undefined)
  useErrorSummary(errors, { attempt, scope: root, sub: refusal })
  const fix = (...keys: string[]) => setErrors((e) => (keys.some((k) => k in e) ? Object.fromEntries(Object.entries(e).filter(([k]) => !keys.includes(k))) : e))
  const [pending, start] = useTransition()
  const [saving, setSaving] = useState(false)
  const dirty = JSON.stringify(d) !== JSON.stringify(saved)
  const guard = useLeaveGuard(dirty)
  // A change to a field takes its mistake away (the patch's keys are the error keys for the top-level fields).
  const set = (patch: Partial<Draft>) => { setD((x) => ({ ...x, ...patch })); fix(...Object.keys(patch)) }
  /** The keys of an object panel (tax, label) that changed, as error keys ("tax.hsn"). */
  const changed = <T extends object>(prefix: string, a: T, b: T) => (Object.keys(b) as (keyof T & string)[]).filter((k) => a[k] !== b[k]).map((k) => `${prefix}.${k}`)

  const opts = d.options.filter((o) => o.name.trim() && o.values.length)
  const combos = useMemo(() => combinations(opts), [d.options]) // eslint-disable-line react-hooks/exhaustive-deps
  const cells = combos.map((c) => d.cells[keyOf(c)] ?? EMPTY_CELL)
  const type = types.find((t) => t.id === d.typeId)
  const colourOpt = d.options[colourIndex(d.options.map((o) => o.name))]
  // The size chart and the model belong to a product with sizes (a saree has neither); a chart already picked stays.
  const showSizes = shop.sized && (d.options.some((o) => isSizeOption(o.name)) || !!d.typeId || !!(d.modelHeight || d.modelSize))
  const prices = cells.map((c) => parseRupees(c.price)).filter((x): x is number => x !== null && x > 0)
  const ready = readiness({
    title: d.title, photos: photos.length, prices: cells.map((c) => parseRupees(c.price) ?? 0),
    sizes: d.options.find((o) => isSizeOption(o.name))?.values ?? [], chartSizes: (type?.sizeChart.rows ?? []).map((r) => r.size),
    anyBuyable: cells.some((c) => shopperSees(c, now).canBuy),
    taxReady: shop.gst.charges ? /^\d{4}(\d{2})?(\d{2})?$/.test(d.tax.hsn) && (ruleOn(d.tax.hsn, now) !== null || !!d.tax.ownBps) : undefined,
    labelMissing: shop.label ? labelMissing(readLabel({ ...d.label, maker: d.label.maker.trim(), shelfMonths: Number(d.label.shelf) || null })) : undefined,
  })

  // Defaults for search and sharing, from the product's own facts (seo.ts).
  const fabricId = d.attributes.fabric?.[0]
  const fabric = fabricId ? d.category?.attributes.find((a) => a.handle === 'fabric')?.values.find((v) => v.id === fabricId)?.name ?? null : null
  const defaults = {
    title: defaultTitle(d.title || 'Product', colourOpt?.values ?? [], shop.name),
    description: defaultDescription({ title: d.title || 'Product', fabric, minPrice: prices.length ? Math.min(...prices) : null, codOn: shop.codOn, returnDays: shop.returnDays, returnKind: shop.returnKind, city: shop.city }),
    handle: handleFor(d.title) || 'product',
  }

  /** A size or colour renamed in place keeps what it had: its cells (price, stock, SKU…), its swatch, and — on save —
   *  the photos tagged with it (PR·0: a rename used to be a remove and an add, wiping all of these). */
  function rename(option: number, from: string, to: string) {
    setD((x) => {
      const options = x.options.map((o, i) => (i === option ? { ...o, values: o.values.map((v) => (v === from ? to : v)) } : o))
      const live = x.options.filter((o) => o.name.trim() && o.values.length)
      const at = live.indexOf(x.options[option]!)
      // A cell already under the new name is left from a value removed earlier (`to` is not a live value: the chip
      // refuses duplicates); it goes, so it can't overwrite the renamed one's.
      const cells = at < 0 ? x.cells : Object.fromEntries(Object.entries(x.cells).filter(([k]) => k.split('\u0000')[at] !== to).map(([k, c]) => {
        const parts = k.split('\u0000')
        if (parts[at] === from) parts[at] = to
        return [parts.join('\u0000'), c]
      }))
      const colours = option === colourIndex(x.options.map((o) => o.name)) ? x.colours.map((c) => (c.value === from ? { ...c, value: to } : c)) : x.colours
      return { ...x, options, cells, colours }
    })
    if (option === colourIndex(d.options.map((o) => o.name))) setRenames((r) => [...r.map((x) => (x.to === from ? { ...x, to } : x)), ...(r.some((x) => x.to === from) ? [] : [{ from, to }])])
    fix('options')
  }

  function save() { start(async () => { await saveNow() }) }
  /** The one Save; true when it saved (Publish with unsaved changes saves first, then publishes: one action). */
  async function saveNow(): Promise<boolean> {
    // Saving is one at a time, whoever started it (the Save bar, Ctrl+S or "Save and publish"): the bar is off meanwhile.
    setSaving(true)
    try {
      const r = await saveProduct(id, version, {
        title: d.title, description: d.description, typeId: d.typeId, modelHeight: d.modelHeight, modelSize: d.modelSize, options: d.options,
        variants: combos.map((c) => ({ values: c, ...(d.cells[keyOf(c)] ?? EMPTY_CELL) })),
        handle: d.handle, seoTitle: d.seoTitle, seoDescription: d.seoDescription, categoryId: d.category?.id ?? null,
        attributes: d.attributes, colours: d.colours, tags: d.tags, tax: d.tax, ...(shop.label ? { label: d.label } : {}),
        ...(d.stories ? { stories: d.stories } : {}), ...(d.pairs ? { pairs: d.pairs.map((p) => p.id) } : {}),
      }, d.collections, renames)
      if (r.ok) {
        setSaved(d); setVersion(r.version); setErrors({}); setRenames([])
        toast.ok(status === 'active' || status === 'unlisted' ? 'Saved. Your shop shows it now.' : 'Saved.')
        if (r.handle !== initial.handle) router.replace(`/console/products/${r.handle}`)
        else router.refresh()
        return true
      }
      const marked = r.errors ?? {}
      if (Object.keys(marked).length) {
        // The summary says the count; a refusal beyond "fix these" is its second line.
        setRefusal(r.error === 'Some fields need a look before saving.' ? undefined : r.error)
        setErrors(marked); setAttempt((a) => a + 1); return false
      }
      setErrors({})
      // Someone else saved first: Reload is the one way on (nothing typed here is cleared until they choose it).
      if (r.conflict) toast.error(r.error, { action: { label: 'Reload', run: () => window.location.reload() } })
      else toast.error(r.error)
      return false
    } finally { setSaving(false) }
  }
  // Ctrl/⌘+S saves (products PR·2): the browser's own "save page" never fires here. Not while a dialog is open, a
  // save is running or a word is still being composed; the size chart's own editor keeps its own Save.
  // It presses the Save bar's own button (the one path a save takes), so it does nothing when there is no bar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's' || e.altKey || e.shiftKey) return
      if (e.target instanceof Element && e.target.closest('[data-own-save]')) return
      e.preventDefault()
      // The size chart's own editor (inline) keeps its own Save: the key is left to it, never taken for the product.
      if (e.isComposing || document.querySelector('dialog:modal')) return
      root.current?.querySelector<HTMLButtonElement>('button[data-save-bar]:not(:disabled)')?.click()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const [mac, setMac] = useState(false)
  useEffect(() => { setMac(/Mac|iPhone|iPad/.test(navigator.platform)) }, [])
  /** Grows the title field to its text where the browser lacks `field-sizing: content` (it then sizes itself), and
   * again when the window changes width (a rotate wraps it to more lines). */
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const fit = (el: HTMLTextAreaElement | null) => {
    if (!el || (typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content'))) return
    el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`
  }
  // After every change of the title (typing, a paste whose newline was just taken out, Discard), before paint.
  useLayoutEffect(() => { fit(titleRef.current) }, [d.title])
  useEffect(() => {
    const again = () => fit(titleRef.current)
    window.addEventListener('resize', again)
    return () => window.removeEventListener('resize', again)
  }, [])
  return (
    <div ref={root} className={dirty ? 'pb-20 md:pb-0' : undefined}>
      {/* PageHeader (rule 13) with the title as a field: the h1 names the product for a screen reader, the field
          shows and edits it. A textarea, so a long title wraps to the next line instead of being cut mid-word
          (stress test S7). One line of text: Enter does nothing, unless an input method is still composing a word. */}
      <PageHeader title={d.title || 'New product'} back={{ href: '/console/products', label: 'Products' }}
        badges={<StatusBadge status={status} publishAt={publishAt} now={now} />}
        actions={share}
        titleSlot={<div className="min-w-0 flex-1">
          <label htmlFor="title" className="sr-only">Product title</label>
          <textarea id="title" rows={1} value={d.title} maxLength={140} {...fieldProps('title', errors.title)} placeholder="Product title"
            onChange={(e) => set({ title: e.target.value.replace(/\s*\n\s*/g, ' ') })}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.preventDefault() }} ref={titleRef}
            className="-mx-2 w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-2xl font-semibold tracking-tight transition-colors duration-fast hover:border-input focus:border-input focus:bg-card aria-invalid:border-danger-text block resize-none overflow-hidden [field-sizing:content] [overflow-wrap:anywhere]" />
        </div>} />
      <FieldError name="title" message={errors.title} />
      {/* The main column in the order a brand works (products PR·2, spec § 4): photos, words, sizes and stock, then what
          describes it. A section with nothing saved in it yet folds to one line (FoldSection); the size chart and the
          model show for a product with sizes. The side panel stays in view on a wide screen, Publish first. */}
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <Section><h2 className="flex items-center text-section font-semibold">Photos<InfoTip about="photos">The first is the cover: show the piece on a person. A large photo is fine; it is resized before it uploads.</InfoTip></h2><Photos productId={id} tenantId={tenantId} photos={photos} colours={colourOpt?.values ?? []} enabled={blobReady} title={d.title} /></Section>
          <Section>
            <label htmlFor="desc" className="block font-semibold">Description <span className="text-sm font-normal text-muted-foreground">(optional)</span></label>
            <textarea id="desc" rows={4} maxLength={5000} value={d.description} onChange={(e) => set({ description: e.target.value })} {...fieldProps('description', errors.description)} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm aria-invalid:border-danger-text" placeholder="Fabric, fit, care. Shoppers read this before the size chart." />
            <FieldError name="description" message={errors.description} />
          </Section>
          {video}
          <Section>
            <h2 className="flex items-center text-section font-semibold">Sizes, colours and stock<InfoTip about="sizes, colours and stock">{shop.costs ? 'Your cost is never shown to shoppers: it is how Frrata works out profit on each order. ' : ''}When it runs out applies at 0 stock: stop selling, take pre-orders, or make to order. An empty SKU is made for you when you save.</InfoTip></h2>
            <OptionsEditor options={d.options} onChange={(options) => set({ options })} error={errors.options} onRename={rename} />
            {colourOpt && colourOpt.values.length > 0 && <ColoursPanel values={colourOpt.values} colours={d.colours} onChange={(colours) => set({ colours })} photos={photos} families={families} />}
            {combos.length > 0 && <VariantGrid options={opts} cells={d.cells} errors={errors} costs={shop.costs} autoSku={(values) => skuFor(shop.skuPrefix, d.handle || defaults.handle, values)}
              onChange={(k, patch) => { setD((x) => ({ ...x, cells: { ...x.cells, [k]: { ...(x.cells[k] ?? EMPTY_CELL), ...patch } } })); fix(...Object.keys(patch).map((f) => `v:${k}:${f === 'leadMin' || f === 'leadMax' ? 'lead' : f}`)) }} />}
          </Section>
          <FoldSection title="Details" start={Object.keys(start0.attributes).length > 0} summary={d.category ? 'Fabric, work, occasion' : 'Pick a category first'}
            side={<InfoTip about="details">Asked for by the product’s category. Shoppers filter by them, and Google and Meta read them. Values marked · are Frrata’s, for Indian crafts and fabrics; each is sent to Google as its nearest standard value.</InfoTip>}>
            <DetailsPanel attributes={d.category?.attributes ?? []} values={d.attributes} onChange={(attributes) => set({ attributes })} />
          </FoldSection>
          {showSizes && <Section><h2 className="text-section font-semibold">Size chart</h2><SizeChartPanel types={types} typeId={d.typeId} onType={(typeId) => set({ typeId })} /></Section>}
          {showSizes && <FoldSection title="The model in the photos" start={!!(start0.modelHeight || start0.modelSize)} summary="Height, size worn">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><label htmlFor="mh" className="block text-sm font-medium">Height <span className="font-normal text-muted-foreground">(optional)</span></label><input id="mh" value={d.modelHeight} maxLength={30} placeholder="5 ft 6 in" onChange={(e) => set({ modelHeight: e.target.value })} className="h-10 md:h-9 w-full rounded-md border border-input bg-card px-3 text-sm" /></div>
              <div className="space-y-1"><label htmlFor="ms" className="block text-sm font-medium">Wears <span className="font-normal text-muted-foreground">(optional)</span></label><input id="ms" value={d.modelSize} maxLength={10} placeholder="S" onChange={(e) => set({ modelSize: e.target.value })} className="h-10 md:h-9 w-full rounded-md border border-input bg-card px-3 text-sm" /></div>
            </div>
          </FoldSection>}
          <SeoPanel handle={d.handle} onHandle={(handle) => set({ handle })} seoTitle={d.seoTitle} onSeoTitle={(seoTitle) => set({ seoTitle })} seoDescription={d.seoDescription} onSeoDescription={(seoDescription) => set({ seoDescription })}
            defaults={defaults} address={shop.address} cover={photos[0]} everLive={everLive} errors={errors} />
          <Section>
            <h2 className="text-section font-semibold">Tax</h2>
            <TaxPanel tax={d.tax} onChange={(tax) => { fix(...changed('tax', d.tax, tax)); set({ tax }) }} price={prices.length ? Math.min(...prices) : null} inclusive={shop.gst.inclusive} charges={shop.gst.charges} now={now} errors={errors}
              onReprice={(to) => setD((x) => ({ ...x, cells: Object.fromEntries(Object.entries(x.cells).map(([k, c]) => {
                const p = parseRupees(c.price)
                return [k, p !== null && inGap(x.tax.hsn, p, shop.gst.inclusive, now) ? { ...c, price: String(to / 100) } : c]
              })) }))} />
          </Section>
          {shop.label && <Section><h2 className="text-section font-semibold">On the pack</h2><LabelPanel label={d.label} onChange={(label) => { fix(...changed('label', d.label, label)); set({ label }) }} errors={errors} maker={shop.maker} /></Section>}
          {d.stories && <Section><StoriesPanel stories={d.stories} onChange={(stories) => set({ stories })} photos={photos} tenantId={tenantId} enabled={blobReady} error={errors.stories} /></Section>}
          {d.pairs && <Section><PairsPanel productId={id} pairs={d.pairs} onChange={(pairs) => set({ pairs })} /></Section>}
        </div>
        <aside className="space-y-3 lg:sticky lg:top-[calc(var(--shell-top,0px)+1rem)] lg:max-h-[calc(100dvh-var(--shell-top,0px)-2rem)] lg:overflow-y-auto">
          <StatusCard productId={id} status={status} publishAt={publishAt} ready={ready} dirty={dirty} saveFirst={saveNow} />
          <Summary d={d} cells={cells} photos={photos} typeName={type?.name ?? null} status={status} publishAt={publishAt} address={`${shop.address}/products/${d.handle || defaults.handle}`} />
          <OrganiseCard category={d.category} onCategory={(category) => set({ category, attributes: keepDetails(d.attributes, category) })} collections={allCollections} picked={d.collections} onPicked={(collections) => set({ collections })} tags={d.tags} onTags={(tags) => set({ tags })} />
          <ReadyFor d={d} photos={photos.length} priced={prices.length === cells.length && cells.length > 0} />
        </aside>
      </div>
      {dirty && <SaveBar placement="bottom" keys={mac ? '⌘S' : 'Ctrl+S'} pending={pending || saving} onSave={save} onDiscard={() => { setD(saved); setErrors({}) }} />}
      <LeaveDialog open={!!guard.leaveTo} what={saved.title || 'this product'} onStay={guard.stay} onLeave={() => guard.leave(() => setSaved(d))} />
    </div>
  )
}

/** The product right now, following the draft: cover, status, price range, what can be bought. */
function Summary({ d, cells, photos, typeName, status, publishAt, address }: { d: Draft; cells: Cell[]; photos: Photo[]; typeName: string | null; status: Status; publishAt: string | null; address: string }) {
  const prices = cells.map((c) => parseRupees(c.price)).filter((x): x is number => x !== null && x > 0)
  const total = cells.reduce((a, c) => a + (Number(c.stock) || 0), 0)
  const now = useNow()
  const sees = cells.map((c) => shopperSees(c, now))
  const soldOut = sees.filter((s) => !s.canBuy).length
  const later = sees.filter((s) => s.kind === 'preorder' || s.kind === 'made_to_order').length
  const cover = photos[0]
  const colourOpt = d.options[colourIndex(d.options.map((o) => o.name))]
  return (
    <Section flush ariaLabel="Summary">
      <div className="flex gap-3 p-4">
        {cover ? <img src={urlFor(cover.base, pick(cover.widths, 160))} alt="" width={64} height={80} className="h-20 w-16 shrink-0 rounded-sm bg-muted object-cover" />
          : <div className="grid h-20 w-16 shrink-0 place-items-center rounded-sm bg-muted text-xs text-muted-foreground">No photo</div>}
        <div className="min-w-0 space-y-1">
          <p className="truncate font-semibold">{d.title || 'Untitled product'}</p>
          <StatusBadge status={status} publishAt={publishAt} now={now} />
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
        <Link href={`/console/preview/products/${address.split('/products/')[1] ?? ''}`} className="inline-flex min-h-6 shrink-0 items-center underline">Preview</Link>
      </div>
    </Section>
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
    { label: 'A colour family for each colour', ok: (() => { const c = d.options[colourIndex(d.options.map((o) => o.name))]; return !c || c.values.every((v) => d.colours.some((x) => x.value === v && x.family)) })() },
  ]
  const missing = needs.filter((n) => !n.ok)
  return (
    <Section labelledBy="ready-h">
      <div className="flex items-center justify-between gap-2"><h2 id="ready-h" className="text-section font-semibold">Ready for</h2><Badge tone={missing.length ? 'warn' : 'ok'}>{missing.length ? `${missing.length} to add` : 'Google and Meta'}</Badge></div>
      {missing.length ? <ul className="space-y-0.5 text-sm text-warn-text">{missing.map((m) => <li key={m.label}><span aria-hidden="true">• </span>{m.label}</li>)}</ul>
        : <p className="text-sm text-muted-foreground">Google Shopping and Meta catalogues will accept it once those channels are connected.</p>}
    </Section>
  )
}

/** Details that still apply under a new category keep their values (a fabric stays a fabric); the rest go, and only
 *  values the new category offers stay (PR·0: changing category silently erased every detail). */
function keepDetails(attributes: Record<string, string[]>, category: PickedCategory | null): Record<string, string[]> {
  if (!category) return {}
  const out: Record<string, string[]> = {}
  for (const a of category.attributes) {
    const ids = new Set(a.values.map((v) => v.id))
    const kept = (attributes[a.handle] ?? []).filter((v) => ids.has(v))
    if (kept.length) out[a.handle] = kept
  }
  return out
}
