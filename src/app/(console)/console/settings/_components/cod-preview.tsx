import { codFor, shippingFor } from '@/domains/checkout/delivery'
import { codWhyNot } from '@/domains/checkout/cod-words'
import type { ShopFacts } from '@/components/shop-preview/previews'
import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'

const inr = (p: number) => formatInr(paise(p))
const card = 'flex flex-col gap-1 rounded-mid border border-border p-3'

/**
 * "At checkout" beside Settings › Pay on delivery (Neel N2b·3, Settings board): what a shopper is offered for a ₹2,290 bag,
 * and, when there is a highest order, for a bag above it. Checkout's own rule and words (codFor, codWhyNot), never a copy.
 */
export function CodPreview({ f }: { f: ShopFacts }) {
  const bag = 229000
  const cod = codFor(bag, f)
  const ship = shippingFor(bag, f)
  const big = f.codMax > 0 ? f.codMax + 40000 : null
  const bigWhy = big ? codWhyNot(codFor(big, f), inr) : null
  return (
    <section aria-labelledby="at-checkout" className="flex flex-col gap-2.5 rounded-lg border border-border p-4 md:px-5">
      <h2 id="at-checkout" className="text-section font-semibold">At checkout</h2>
      {!f.codOn ? (
        <div className={card}><b className="font-medium">Pay on delivery is off</b><span className="text-label text-muted-foreground">Shoppers pay online.</span></div>
      ) : cod.offered ? (
        <div className={card}>
          <span className="flex justify-between gap-3"><b className="font-medium">Pay on delivery</b><span className="font-num tabular-nums">{inr(bag + ship + f.codCharge)}</span></span>
          <span className="text-label text-muted-foreground">{f.codCharge > 0 ? `Includes a ${inr(f.codCharge)} Pay on delivery fee. ` : ''}Cash or UPI to the courier.</span>
        </div>
      ) : (
        <div className={card}><b className="font-medium">A {inr(bag)} bag</b><span className="text-label text-muted-foreground">{codWhyNot(cod, inr)}</span></div>
      )}
      {f.codOn && big && bigWhy ? (
        <div className={`${card} text-muted-foreground`}><b className="font-medium text-foreground">A {inr(big)} bag</b><span className="text-label">{bigWhy}</span></div>
      ) : null}
    </section>
  )
}
