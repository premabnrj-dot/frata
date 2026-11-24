'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { chartSizesOf, firstProductShape } from '@/domains/catalogue/first-product'
import { fromRupees } from '@/domains/money/paise'
import { asMember } from '@/lib/auth/as-member'
import { memberAudit } from '@/lib/auth/member-audit'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { ensureTypes } from '@/lib/catalogue/handles'
import { attachIn } from '@/lib/catalogue/photos'
import { setStatusIn } from '@/lib/catalogue/status'
import { skuTaken, writeProducts } from '@/lib/catalogue/write'
import { shopSettings } from '@/lib/db/schema'
import { productTypes } from '@/lib/db/schema-catalogue'
import { errName } from '@/lib/log'
import { photosAreMade } from '@/lib/media/uploaded'
import { lockTimedOut } from '@/lib/orders/place'
import { firstProductFormFor, type FirstProductForm } from '@/lib/queries/catalogue'
import { refreshShop } from '@/lib/queries/storefront'

// =============================================================================
// FILE: src/app/(console)/console/products/first-product-actions.ts
//
// HOME'S FIRST-PRODUCT POPUP (plan docs/plans/2026-11-23-o2a-setup-card.md O2a·6). Not a second writer: it composes
// the editor's own pieces — writeProducts (the one writer of variants), attachIn (photos into this store's folder only),
// setStatusIn (Active only through readiness()) — in ONE asMember transaction. The photos' first bytes are read before
// it (photosAreMade, network), never inside it. Its sizes come from firstProductShape, the rule createProduct reads.
// =============================================================================

const WORDS = {
  title: 'Give your product a name of up to 140 characters.',
  price: 'Whole rupees, digits only.',
  stock: 'A number, 0 or more.',
  sizes: 'Choose sizes from the list.',
} as const

const Input = z.object({
  title: z.string().max(400),
  price: z.string().max(40),
  stock: z.string().max(20),
  sizes: z.array(z.string().max(40)).max(12),
  photos: z.array(z.object({ base: z.string().max(300), widths: z.array(z.number().int()).max(8), width: z.number(), height: z.number() }).strict()).max(4),
}).strict()
export type FirstProductInput = z.input<typeof Input>

export type AddResult =
  | { ok: true; status: 'active' | 'draft'; id: string; handle: string; needs?: string[] }
  | { ok: false; error: string; errors?: Record<string, string> }

class Stop extends Error { constructor(readonly result: Extract<AddResult, { ok: false }>) { super('stop') } }
const FAILED = 'We couldn’t add the product. Nothing was saved.'

/** `activate`: "Add product" asks for Active (kept a draft, with its needs, when not ready); "Add more details" does not. */
export async function addFirstProduct(input: FirstProductInput, activate: boolean): Promise<AddResult> {
  const parsed = Input.safeParse(input)
  if (!parsed.success) return { ok: false, error: FAILED }
  const p = parsed.data
  const errors: Record<string, string> = {}
  const title = p.title.trim().replace(/\s+/g, ' ')
  if (!title || title.length > 140) errors.title = WORDS.title
  const rupees = p.price.replace(/[,₹\s]/g, '')
  if (!/^\d{1,6}$/.test(rupees) || Number(rupees) < 1) errors.price = WORDS.price
  const stock = p.stock.trim()
  if (!/^\d{1,5}$/.test(stock)) errors.stock = WORDS.stock
  if (Object.keys(errors).length) return { ok: false, error: 'Some fields need a look.', errors }
  const price = fromRupees(Number(rupees))
  // Outside any transaction: reading each file's first bytes is network, and a transaction never waits on it.
  if (!(await photosAreMade(p.photos))) return { ok: false, error: 'That file is not a photo we made. Upload it again.' }
  try {
    const r = await asMember(ANY_MEMBER, { action: 'product.create', target: title }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      await ensureTypes(tx, tenantId)
      const [[shop], types] = await Promise.all([
        tx.select({ sells: shopSettings.sells, hsn: shopSettings.defaultHsn }).from(shopSettings).where(eq(shopSettings.tenantId, tenantId)),
        tx.select({ id: productTypes.id, name: productTypes.name, chart: productTypes.sizeChart }).from(productTypes).where(eq(productTypes.tenantId, tenantId)),
      ])
      const shape = firstProductShape(title, types.map((t) => ({ id: t.id, name: t.name, chartSizes: chartSizesOf(t.chart) })), shop?.sells ?? [])
      const sizes = shape.sized ? shape.options.filter((o) => p.sizes.includes(o)) : []
      if (shape.sized && (!p.sizes.length || sizes.length !== new Set(p.sizes).size)) throw new Stop({ ok: false, error: 'Some fields need a look.', errors: { sizes: WORDS.sizes } })
      const cell = (values: string[]) => ({ values, price, compareAt: null, unitCost: null, stock: Number(stock), sku: null, gtin: null, whenOut: 'stop' as const, shipsBy: null, leadMinDays: null, leadMaxDays: null, preorderCap: null })
      const w = await writeProducts(tx, tenantId, [{ handle: '', title, options: sizes.length ? [{ name: 'Size', values: sizes }] : [],
        variants: sizes.length ? sizes.map((s) => cell([s])) : [cell([])], row: { typeId: shape.typeId, hsn: shop?.hsn ?? null } }], { costs: false })
      if (!w.ok) throw new Stop({ ok: false, error: w.error })
      const made = w.products[0]!
      if (p.photos.length) {
        const done = await attachIn(tx, tenantId, made.id, p.photos.map((ph) => ({ ...ph, colour: null })))
        if (!done.ok) throw new Stop(done)
      }
      let needs: string[] | undefined
      let status: 'active' | 'draft' = 'draft'
      if (activate) {
        const s = await setStatusIn(tx, tenantId, [made.id], 'active', null, new Date())
        if (s.changed.length) status = 'active'
        else needs = s.refused[0]?.needs ?? []
      }
      await memberAudit(tx, auth, 'product.create', title)
      return { status, id: made.id, handle: made.handle, ...(needs ? { needs } : {}) }
    })
    if (!r.ok) return { ok: false, error: r.error }
    refreshShop(r.tenantId, 'catalogue')
    revalidatePath('/console', 'layout')
    return { ok: true, ...r.value }
  } catch (err) {
    if (err instanceof Stop) return err.result
    if (skuTaken(err)) return { ok: false, error: 'Another product in your store already uses that SKU.' }
    if (lockTimedOut(err)) return { ok: false, error: 'Someone is buying this product right now. Save again in a moment.' }
    console.error('[addFirstProduct]', errName(err))
    return { ok: false, error: FAILED }
  }
}

/** What the popup reads when it opens: what the store sells, its starting HSN, its types and their chart sizes. */
export async function loadFirstProduct(): Promise<({ ok: true } & FirstProductForm) | { ok: false; error: string }> {
  const me = await requireMember(ANY_MEMBER)
  if (!me.ok) return { ok: false, error: me.message }
  try {
    return { ok: true, ...(await firstProductFormFor(me.membership.tenantId)) }
  } catch (err) {
    console.error('[loadFirstProduct]', errName(err))
    return { ok: false, error: 'We couldn’t load this. Try again in a minute.' }
  }
}
