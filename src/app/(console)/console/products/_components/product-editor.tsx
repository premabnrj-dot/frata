'use client'

import { isSizeOption } from '@/domains/storefront/picker'
import { colourIndex } from '@/domains/catalogue/option-kind'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LeaveDialog, SaveBar, useLeaveGuard } from '@/components/ui/unsaved'
import { FieldError, fieldProps, useErrorSummary } from '@/components/ui/field-error'
import { useToast } from '@/components/ui/toast'
import type { Status } from '@/domains/catalogue/availability'
import { readiness, type ColourInput } from '@/domains/catalogue/product-form'
import { parseRupees } from '@/domains/money/rupees'
import { defaultDescription, defaultTitle } from '@/domains/seo/defaults'
import { combinations, handleFor, keyOf, skuFor, type Option } from '@/domains/catalogue/variants'
import { saveProduct } from '../actions'
import { ColoursPanel, type Family } from './colours-panel'
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
import { FIELD } from '@/components/ui/field'
import { announce } from '@/components/shell/announce'
import { commonPrice, targetsOf, targetsWords } from '@/domains/catalogue/common-price'
import { rupeesText } from '@/domains/money/rupees'
import { WhatsAppPreview } from './editor-side'
import { ProductMore } from './product-more'

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
export function ProductEditor({ initial, shop, photos, types, tenantId, blobReady, allCollections, families, share, video, host }: {
  initial: EditorProduct; shop: EditorShop; photos: Photo[]; types: TypeRow[]; tenantId: string; blobReady: boolean; allCollections: CollectionChip[]; families: Family[]
  /** The Share button (search and sharing S1·7), made on the server for this shop. */
  share?: React.ReactNode
  /** The Video card (PV·1), made on the server: it saves as it changes, outside the one Save. */
  video?: React.ReactNode
  /** The shop's main host, for the WhatsApp card's last line. */
  host: string
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
  // The common price and M.R.P. (common-price.ts): what most sizes share, set on those sharing it and those with none.
  // The variants it writes to are fixed when the field gets focus, so clearing it never takes a size priced on its own.
  const commonRows = (f: 'price' | 'compareAt') => combos.map((c) => ({ key: keyOf(c), label: c.join(' · '), text: (d.cells[keyOf(c)] ?? EMPTY_CELL)[f] ?? '' }))
  const [typing, setTyping] = useState<{ f: 'price' | 'compareAt'; keys: string[]; text: string } | null>(null)
  const commonText = (f: 'price' | 'compareAt') => (typing?.f === f ? typing.text : rupeesText(commonPrice(commonRows(f).map((r) => r.text))))
  const setCommon = (f: 'price' | 'compareAt', text: string) => {
    const keys = typing?.f === f ? typing.keys : targetsOf(commonRows(f))
    setTyping({ f, keys, text })
    setD((x) => ({ ...x, cells: { ...x.cells, ...Object.fromEntries(keys.map((k) => [k, { ...(x.cells[k] ?? EMPTY_CELL), [f]: text }])) } }))
    fix(...keys.map((k) => `v:${k}:${f}`))
  }
  // "3 unsaved changes": the top-level fields and the variant cells that differ from what was saved (Discard → 0).
  const changes = useMemo(() => {
    const top = (Object.keys(d) as (keyof Draft)[]).filter((k) => k !== 'cells' && JSON.stringify(d[k]) !== JSON.stringify(saved[k])).length
    const ks = new Set([...Object.keys(d.cells), ...Object.keys(saved.cells)])
    return top + [...ks].filter((k) => JSON.stringify(d.cells[k]) !== JSON.stringify(saved.cells[k])).length
  }, [d, saved])
  const wasDirty = useRef(false)
  useEffect(() => { if (dirty && !wasDirty.current) announce('Unsaved changes.'); wasDirty.current = dirty }, [dirty])
  const has = (...prefixes: string[]) => Object.keys(errors).some((k) => prefixes.some((p) => k === p || k.startsWith(`${p}.`)))
  const priceWords = targetsWords(commonRows('price'))
  const field = 'flex flex-col gap-1.5 text-label font-medium'
  const sizedSummary = type ? `${type.name} · ${(type.sizeChart.rows ?? []).map((r) => r.size).filter(Boolean).slice(0, 1).concat((type.sizeChart.rows ?? []).slice(-1).map((r) => r.size)).join('–')}` : 'Pick a chart'
  return (
    // While there are changes the save bar sits at the foot: the page leaves room under it, so it never covers a field.
    <div ref={root} className={dirty ? 'pb-24 [scroll-padding-bottom:7rem] md:pb-4' : undefined}>
      <PageHeader title={d.title || 'New product'} back={{ href: '/console/products', label: 'Products' }}
        badges={<StatusBadge status={status} publishAt={publishAt} now={now} />}
        actions={<>{share}<ProductMore id={id} title={saved.title} handle={saved.handle} status={status} everLive={everLive} shopUrl={`https://${host}/products/${saved.handle}`} dirty={dirty} /></>} />
      {/* The main column in the order a brand works (Neel N2, as drawn): photos; name, price, description; sizes and
          colours; stock and prices; then one line each for what describes it. The side panel stays in view on a wide
          screen, Publish first. */}
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <Section title="Photos" action={<span className="text-small text-muted-foreground">Drag to order · the first is the cover</span>}>
            <Photos productId={id} tenantId={tenantId} photos={photos} colours={colourOpt?.values ?? []} enabled={blobReady} title={d.title} />
          </Section>
          <Section title="Name, price, description">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <label className={field}>Name
                <input id="title" value={d.title} maxLength={140} {...fieldProps('title', errors.title)} onChange={(e) => set({ title: e.target.value })} className={`${FIELD} aria-invalid:border-danger-text`} />
                <FieldError name="title" message={errors.title} />
              </label>
              <label className={field}>Price, ₹
                <input id="price-common" inputMode="decimal" value={commonText('price')} onChange={(e) => setCommon('price', e.target.value)} onBlur={() => setTyping(null)}
                  disabled={!combos.length} className={`${FIELD} font-num tabular-nums`} />
              </label>
              <label className={field}>M.R.P., ₹
                <input id="mrp-common" inputMode="decimal" value={commonText('compareAt')} onChange={(e) => setCommon('compareAt', e.target.value)} onBlur={() => setTyping(null)}
                  disabled={!combos.length} className={`${FIELD} font-num tabular-nums`} />
              </label>
            </div>
            {priceWords ? <p className="text-small text-muted-foreground">{priceWords}</p> : null}
            <label className={field}>Description
              <textarea id="desc" rows={3} maxLength={5000} value={d.description} onChange={(e) => set({ description: e.target.value })} {...fieldProps('description', errors.description)} className="w-full rounded-md border border-input bg-card px-2.5 py-2 text-sm font-normal aria-invalid:border-danger-text" />
              <FieldError name="description" message={errors.description} />
            </label>
            <p className="truncate text-small text-muted-foreground">{host}/products/<b className="font-medium text-foreground">{d.handle || defaults.handle}</b>{everLive ? null : ' · follows the name until it is live'}</p>
          </Section>
          <Section title="Sizes and colours" action={combos.length ? <span className="text-small text-muted-foreground tabular-nums">{combos.length} of 100</span> : undefined}>
            <OptionsEditor options={d.options} onChange={(options) => set({ options })} error={errors.options} onRename={rename} />
            {colourOpt && colourOpt.values.length > 0 && <ColoursPanel values={colourOpt.values} colours={d.colours} onChange={(colours) => set({ colours })} photos={photos} families={families} />}
          </Section>
          {combos.length > 0 && <Section title="Stock and prices">
            <VariantGrid options={opts} cells={d.cells} errors={errors} costs={shop.costs} autoSku={(values) => skuFor(shop.skuPrefix, d.handle || defaults.handle, values)}
              onChange={(k, patch) => { setD((x) => ({ ...x, cells: { ...x.cells, [k]: { ...(x.cells[k] ?? EMPTY_CELL), ...patch } } })); fix(...Object.keys(patch).map((f) => `v:${k}:${f === 'leadMin' || f === 'leadMax' ? 'lead' : f}`)) }} />
          </Section>}
          <FoldSection title="Details" start={Object.keys(start0.attributes).length > 0} action={Object.keys(d.attributes).length ? 'Edit' : 'Add'}
            summary={d.category ? 'Fabric, work, occasion' : 'Pick a category first'} invalid={has('attributes')}>
            <DetailsPanel attributes={d.category?.attributes ?? []} values={d.attributes} onChange={(attributes) => set({ attributes })} />
          </FoldSection>
          {showSizes && <FoldSection title="Size chart" start={false} action={d.typeId ? 'Edit' : 'Add'} summary={sizedSummary} invalid={has('typeId')}>
            <SizeChartPanel types={types} typeId={d.typeId} onType={(typeId) => set({ typeId })} />
          </FoldSection>}
          <FoldSection title="Search and sharing" start={false} action="Edit" summary={`${d.seoTitle || defaults.title}`} invalid={has('handle', 'seoTitle', 'seoDescription')}>
            <SeoPanel bare handle={d.handle} onHandle={(handle) => set({ handle })} seoTitle={d.seoTitle} onSeoTitle={(seoTitle) => set({ seoTitle })} seoDescription={d.seoDescription} onSeoDescription={(seoDescription) => set({ seoDescription })}
              defaults={defaults} address={shop.address} cover={photos[0]} everLive={everLive} errors={errors} />
          </FoldSection>
          <FoldSection title="Tax" start={false} action={d.tax.hsn ? 'Edit' : 'Add'} summary={d.tax.hsn ? `HSN ${d.tax.hsn}` : shop.gst.charges ? 'Needs an HSN code' : 'No GST charged'} invalid={has('tax')}>
            <TaxPanel tax={d.tax} onChange={(tax) => { fix(...changed('tax', d.tax, tax)); set({ tax }) }} price={commonPrice(cells.map((c) => c.price))} inclusive={shop.gst.inclusive} charges={shop.gst.charges} now={now} errors={errors}
              onReprice={(to) => {
                const hit = combos.map(keyOf).filter((k) => { const p = parseRupees((d.cells[k] ?? EMPTY_CELL).price); return p !== null && inGap(d.tax.hsn, p, shop.gst.inclusive, now) })
                setD((x) => ({ ...x, cells: { ...x.cells, ...Object.fromEntries(hit.map((k) => [k, { ...(x.cells[k] ?? EMPTY_CELL), price: rupeesText(to) }])) } }))
                fix(...hit.map((k) => `v:${k}:price`))
              }} />
          </FoldSection>
          {video}
          {showSizes && <FoldSection title="The model in the photos" start={!!(start0.modelHeight || start0.modelSize)} action={d.modelHeight || d.modelSize ? 'Edit' : 'Add'} summary="Height, size worn">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={field}>Height <input id="mh" value={d.modelHeight} maxLength={30} placeholder="5 ft 6 in" onChange={(e) => set({ modelHeight: e.target.value })} className={FIELD} /></label>
              <label className={field}>Wears <input id="ms" value={d.modelSize} maxLength={10} placeholder="S" onChange={(e) => set({ modelSize: e.target.value })} className={FIELD} /></label>
            </div>
          </FoldSection>}
          {shop.label && <FoldSection title="On the pack" start={false} action="Edit" summary={ready.find((r) => r.label.startsWith('Its label'))?.label ?? 'What the pack says'} invalid={has('label')}>
            <LabelPanel label={d.label} onChange={(label) => { fix(...changed('label', d.label, label)); set({ label }) }} errors={errors} maker={shop.maker} />
          </FoldSection>}
          {d.stories && <Section><StoriesPanel stories={d.stories} onChange={(stories) => set({ stories })} photos={photos} tenantId={tenantId} enabled={blobReady} error={errors.stories} /></Section>}
          {d.pairs && <Section><PairsPanel productId={id} pairs={d.pairs} onChange={(pairs) => set({ pairs })} /></Section>}
        </div>
        <aside className="space-y-3 lg:sticky lg:top-[calc(var(--shell-top,0px)+1rem)] lg:max-h-[calc(100dvh-var(--shell-top,0px)-2rem)] lg:overflow-y-auto">
          <StatusCard productId={id} status={status} publishAt={publishAt} ready={ready} dirty={dirty} saveFirst={saveNow} />
          <WhatsAppPreview title={d.seoTitle.replace(/\s*\|[^|]*$/, '') || d.title} description={d.seoDescription || defaults.description} cover={photos[0]} cells={cells} shop={shop.name} host={host} />
          <OrganiseCard category={d.category} onCategory={(category) => set({ category, attributes: keepDetails(d.attributes, category) })} collections={allCollections} picked={d.collections} onPicked={(collections) => set({ collections })} tags={d.tags} onTags={(tags) => set({ tags })} />
        </aside>
      </div>
      {dirty && <SaveBar placement="bottom" keys={mac ? '⌘S' : 'Ctrl+S'} count={changes} pending={pending || saving} onSave={save} onDiscard={() => { setD(saved); setErrors({}); setTyping(null); announce('Changes discarded.') }} />}
      <LeaveDialog open={!!guard.leaveTo} what={saved.title || 'this product'} onStay={guard.stay} onLeave={() => guard.leave(() => setSaved(d))} />
    </div>
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
