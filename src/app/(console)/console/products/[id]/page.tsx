import { notFound } from 'next/navigation'
import { Panel } from '@/components/ui/panel'
import { rupeesText } from '@/domains/catalogue/product-form'
import { keyOf } from '@/domains/catalogue/variants'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { isBlobConfigured } from '@/lib/env'
import { SHOP_DOMAIN } from '@/lib/public-env'
import { orderPrefix } from '@/domains/signup/slug'
import { productForEdit } from '@/lib/queries/catalogue'
import { ProductEditor } from '../_components/product-editor'

export const metadata = { title: 'Product · Frata' }

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const data = await productForEdit(auth.membership.tenantId, id).catch((err) => { console.error('[product]', err instanceof Error ? err.name : err); return undefined })
  if (data === undefined) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  if (!data) notFound()
  const { product: p } = data
  // The editor gets rupees as text; the cost travels as `cost` (the merchant's own, in their console).
  const cells = Object.fromEntries(data.variants.map((v) => [keyOf(v.optionValues), {
    price: v.price ? rupeesText(v.price) : '', compareAt: rupeesText(v.compareAt), cost: rupeesText(v.unitCost), stock: String(v.stock), sku: v.sku ?? '',
  }]))
  return (
    <ProductEditor
      tenantId={auth.membership.tenantId}
      blobReady={isBlobConfigured()}
      initial={{
        id: p.id, title: p.title, description: p.description, typeId: p.typeId, modelHeight: p.modelHeight, modelSize: p.modelSize,
        options: p.options.map((name, i) => ({ name, values: p.optionValues[i] ?? [] })), cells, version: p.version, published: p.publishedAt !== null,
        handle: p.handle, skuPrefix: orderPrefix(data.shop.orderPrefix, data.shop.name), shopAddress: `${data.shop.slug}.${SHOP_DOMAIN}`,
      }}
      photos={data.images.map((i) => ({ id: i.id, base: i.base, widths: i.widths, optionValue: i.optionValue, width: i.width, height: i.height }))}
      types={data.types}
    />
  )
}
