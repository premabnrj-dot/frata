import type { ReactNode } from 'react'
import type { ModuleKey } from '@/domains/modules/registry'
import type { LdRating } from '@/domains/seo/defaults'
import { shopModules } from '@/lib/queries/modules'

// =============================================================================
// FILE: src/components/modules/storefront.tsx — where modules plug into a shop's product page (Reviews R1 task 2).
//
// The storefront's hook point (check:modules HOOKS), as slots.tsx is the console's. A filler returns what goes under
// the product (`below`) and its rating (`rating`) from ONE read, and the page hands that rating to productJsonLd —
// so the widget and Google's markup can never disagree (architecture review R1, finding 3). A filler runs only when
// its module is usable; with no filler nothing is read, so an empty hook costs a page nothing.
// =============================================================================

export type ProductExtras = { below: ReactNode | null; rating: LdRating | null }
export type ProductContext = { tenantId: string; productId: string; at: string }
type ProductFiller = { module: ModuleKey; load: (ctx: ProductContext) => Promise<ProductExtras> }

const PRODUCT: ProductFiller[] = []
const NONE: ProductExtras = { below: null, rating: null }

export async function productExtras(ctx: ProductContext): Promise<ProductExtras> {
  if (!PRODUCT.length) return NONE
  const { access } = await shopModules(ctx.tenantId, ctx.at)
  const live = PRODUCT.filter((f) => access[f.module].usable)
  if (!live.length) return NONE
  const got = await Promise.all(live.map((f) => f.load(ctx).catch(() => NONE)))
  return { below: got.some((g) => g.below) ? <>{got.map((g, i) => <div key={live[i]!.module}>{g.below}</div>)}</> : null, rating: got.find((g) => g.rating)?.rating ?? null }
}
