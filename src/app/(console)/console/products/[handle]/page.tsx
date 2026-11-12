import { notFound, redirect } from 'next/navigation'
import { Panel } from '@/components/ui/panel'
import { matches, type Rule } from '@/domains/catalogue/collection-rules'
import { rupeesText } from '@/domains/money/rupees'
import { attributesFor, categoryById, COLOUR_FAMILIES } from '@/domains/catalogue/taxonomy'
import { keyOf } from '@/domains/catalogue/variants'
import { availability, type WhenOut } from '@/domains/catalogue/availability'
import { orderPrefix } from '@/domains/signup/slug'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { isBlobConfigured } from '@/lib/env'
import { placeForPincode } from '@/lib/db/platform'
import { shopHost } from '@/lib/public-env'
import { mainHostFor } from '@/lib/queries/addresses'
import { productForEdit, productHandleById, productIdByHandle } from '@/lib/queries/catalogue'
import { chargesGst, type Scheme } from '@/domains/tax/gst'
import { labelAsked, labelInput, readLabel } from '@/domains/catalogue/label'
import { sellsSized } from '@/domains/catalogue/sell-keys'
import { ProductEditor } from '../_components/product-editor'
import { ShareSheet } from '../../_components/share-sheet'
import { shareFor } from '@/lib/seo/share'
import { NowProvider } from '@/components/time/now'
import { readStories } from '@/domains/catalogue/stories'
import { refusal } from '@/lib/auth/as-module'
import { shopModules } from '@/lib/queries/modules'
import { productVideoOf } from '@/lib/queries/videos'
import { ON_SHOP, productVideoView } from '@/lib/video/product-view'
import { VideoPanel } from '../_components/video-panel'

/** The tab names the product ("Linen kurta set · Kesar Studio"), never "Product" (stress test S14). */
export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return { title: 'Product' }
  const p = await productIdByHandle(auth.membership.tenantId, decodeURIComponent((await params).handle).toLowerCase()).catch(() => null)
  return { title: p?.title ?? 'Product' }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** /console/products/<handle>. An id (old links) or an old handle redirects to the current handle. */
export default async function ProductPage({ params }: { params: Promise<{ handle: string }> }) {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const tenantId = auth.membership.tenantId
  const { handle: raw } = await params
  const handle = decodeURIComponent(raw).toLowerCase()
  if (UUID.test(handle)) {
    const h = await productHandleById(tenantId, handle)
    if (!h) notFound()
    redirect(`/console/products/${h}`)
  }
  if (!/^[a-z0-9-]{1,100}$/.test(handle)) notFound()
  const found = await productIdByHandle(tenantId, handle).catch(() => undefined)
  if (found === undefined) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  if (!found) notFound()
  if (found.handle !== handle) redirect(`/console/products/${found.handle}`)

  const data = await productForEdit(tenantId, found.id, auth.membership.role).catch((err) => { console.error('[product]', err instanceof Error ? err.name : err); return undefined })
  if (data === undefined) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  if (!data || !data.shop) notFound()
  const { product: p, shop } = data
  // The editor gets rupees as text; the cost travels as `cost` (the merchant's own), and only to whoever seesCosts.
  const cells = Object.fromEntries(data.variants.map((v) => [keyOf(v.optionValues), {
    price: v.price ? rupeesText(v.price) : '', compareAt: rupeesText(v.compareAt), cost: rupeesText(v.unitCost), stock: String(v.stock), sku: v.sku ?? '', gtin: v.gtin ?? '',
    whenOut: v.whenOut as WhenOut, shipsBy: v.shipsBy ?? '', leadMin: v.leadMinDays ? String(v.leadMinDays) : '', leadMax: v.leadMaxDays ? String(v.leadMaxDays) : '', cap: v.preorderCap === null ? '' : String(v.preorderCap),
  }]))
  const attributes = Object.fromEntries(data.attributes.map((a) => [a.attribute, a.values]))
  const category = categoryById(p.taxonomyCategory)
  // Automatic collections it is in now, from its saved facts (collection-rules.ts).
  const now = new Date()
  const facts = {
    categoryId: p.taxonomyCategory, attributes, colourFamilies: data.colours.map((c) => c.family).filter((x): x is string => !!x),
    minPrice: data.variants.length ? Math.min(...data.variants.map((v) => v.price)) : null,
    inStock: data.variants.some((v) => availability({ ...v, whenOut: v.whenOut as WhenOut }, now).canBuy), tags: p.tags,
  }
  const collections = data.collections.map((c) => ({
    id: c.id, title: c.title, kind: c.kind as 'manual' | 'auto',
    in: c.kind === 'manual' ? data.memberOf.includes(c.id) : matches(c.rules as Rule[], c.matchAll === 1, facts),
  }))

  // What the editor needs besides the product, at once (products PR·2: five round trips in a row became one wait): the
  // pickup's city, the video and whether the shop may add one (PV·1), the share card, the main address (D2·9). Each
  // fails on its own: the video's failure is its own state, never the page's.
  const [place, video, modules, share, address] = await Promise.all([
    shop.pickup ? placeForPincode(shop.pickup).catch(() => null) : null,
    productVideoOf(tenantId, p.id).catch(() => undefined),
    shopModules(tenantId, now.toISOString()),
    shareFor(tenantId, { kind: 'product', id: p.id }, now).catch(() => null),
    mainHostFor(tenantId, shop.slug).catch(() => shopHost(shop.slug)),
  ])
  const va = modules.access.product_video
  // One render time for the whole editor, server and browser alike (src/components/time/now.tsx, check:clock).
  return (
    <NowProvider at={now.toISOString()}>
    <ProductEditor
      tenantId={tenantId}
      blobReady={isBlobConfigured()}
      initial={{
        id: p.id, title: p.title, description: p.description, typeId: p.typeId, modelHeight: p.modelHeight, modelSize: p.modelSize,
        options: p.options.map((name, i) => ({ name, values: p.optionValues[i] ?? [] })), cells, version: p.version,
        status: p.status as 'draft', publishAt: p.publishAt ? p.publishAt.toISOString() : null, everLive: p.publishedAt !== null,
        handle: p.handle, seoTitle: p.seoTitle, seoDescription: p.seoDescription, tags: p.tags,
        category: category ? { id: category.id, name: category.name, path: category.path, attributes: attributesFor(category.id) } : null,
        attributes, collections: collections.filter((c) => c.kind === 'manual' && c.in).map((c) => c.id),
        colours: data.colours.map((c) => ({ value: c.value, family: c.family, hex: c.hex, crop: c.cropImageId && c.crop ? { imageId: c.cropImageId, ...c.crop } : null })),
        tax: { hsn: p.hsn ?? '', uqc: p.uqc, ownBps: p.gstBps === null ? '' : String(p.gstBps), origin: p.originCountry ?? '' },
        label: labelInput(readLabel(p.label)),
        ...(data.offers.stories ? { stories: readStories(p.stories) } : {}), ...(data.offers.pairs ? { pairs: data.pairs } : {}),
      }}
      shop={{
        name: shop.name, address, skuPrefix: orderPrefix(shop.orderPrefix, shop.name),
        codOn: shop.codOn, returnDays: shop.returnDays, returnKind: shop.returnKind, city: place?.city ?? null, costs: data.costs,
        gst: { charges: chargesGst({ gstin: shop.gstin, scheme: shop.gstScheme as Scheme }), inclusive: shop.pricesIncludeGst },
        sized: sellsSized(shop.sells), label: labelAsked(shop.sells), maker: [shop.legalName || shop.name, shop.legalAddress].filter(Boolean).join(', '),
      }}
      allCollections={collections}
      families={COLOUR_FAMILIES}
      photos={data.images.map((i) => ({ id: i.id, base: i.base, widths: i.widths, optionValue: i.optionValue, width: i.width, height: i.height, alt: i.alt ?? '' }))}
      types={data.types}
      video={<VideoPanel productId={p.id} title={p.title} onShop={ON_SHOP} initial={video ? productVideoView(video, now) : null}
        // A failed read never offers "Add a video" (a start would only meet "One video per product").
        blocked={video === undefined ? { words: 'We could not load the video. Reload the page.', apps: false } : va.usable ? null : { words: refusal('product_video', va), apps: va.why === 'off' }} />}
      share={share ? <ShareSheet share={share} target={{ kind: 'product', id: p.id }} /> : null}
    />
    </NowProvider>
  )
}
