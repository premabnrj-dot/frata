import { notFound, redirect } from 'next/navigation'
import { Panel } from '@/components/ui/panel'
import { matches, type Rule } from '@/domains/catalogue/collection-rules'
import { rupeesText } from '@/domains/catalogue/product-form'
import { attributesFor, categoryById, COLOUR_FAMILIES } from '@/domains/catalogue/taxonomy'
import { keyOf } from '@/domains/catalogue/variants'
import { availability, type WhenOut } from '@/domains/catalogue/availability'
import { orderPrefix } from '@/domains/signup/slug'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { isBlobConfigured } from '@/lib/env'
import { placeForPincode } from '@/lib/db/platform'
import { shopHost } from '@/lib/public-env'
import { productForEdit, productHandleById, productIdByHandle } from '@/lib/queries/catalogue'
import { ProductEditor } from '../_components/product-editor'
import { ShareSheet } from '../../_components/share-sheet'
import { shareFor } from '@/lib/seo/share'
import { NowProvider } from '@/components/time/now'

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
  const place = shop.pickup ? await placeForPincode(shop.pickup).catch(() => null) : null
  // The editor gets rupees as text; the cost travels as `cost` (the merchant's own), and only to whoever seesCosts.
  const cells = Object.fromEntries(data.variants.map((v) => [keyOf(v.optionValues), {
    price: v.price ? rupeesText(v.price) : '', compareAt: rupeesText(v.compareAt), cost: rupeesText(v.unitCost), stock: String(v.stock), sku: v.sku ?? '',
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

  const share = await shareFor(tenantId, { kind: 'product', id: p.id }, now).catch(() => null)
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
      }}
      shop={{
        name: shop.name, address: shopHost(shop.slug), skuPrefix: orderPrefix(shop.orderPrefix, shop.name),
        codOn: shop.codOn, returnDays: shop.returnDays, returnKind: shop.returnKind, city: place?.city ?? null, costs: data.costs,
      }}
      allCollections={collections}
      families={COLOUR_FAMILIES}
      photos={data.images.map((i) => ({ id: i.id, base: i.base, widths: i.widths, optionValue: i.optionValue, width: i.width, height: i.height, alt: i.alt ?? '' }))}
      types={data.types}
      share={share ? <ShareSheet share={share} target={{ kind: 'product', id: p.id }} /> : null}
    />
    </NowProvider>
  )
}
