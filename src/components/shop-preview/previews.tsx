import { codFor, codWhyNot, shippingFor } from '@/domains/checkout/delivery'
import type { PolicyFacts, PolicyPage } from '@/domains/policies/render'
import { PolicyBody, POLICY_TITLE } from '@/components/storefront/policy'
import { orderPrefix } from '@/domains/signup/slug'
import { gstinValid } from '@/domains/settings/sections'
import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'
import { displayFamily } from './fonts'

// =============================================================================
// FILE: src/components/shop-preview/previews.tsx
//
// THE SHOP AS SHOPPERS WILL SEE IT, beside each Settings page. PROPS ONLY: no
// fetch, no cache, no tenant (plan § Shape) — the settings page passes the
// draft. In 1B the storefront renders these same pieces, so the preview is the
// shop, not a drawing of it.
// =============================================================================

export type ShopFacts = PolicyFacts & {
  slug: string
  shopDomain: string
  orderPrefix: string
  originCountry: string
  whatsapp: string
  instagram: string
  accent: string
  displayFont: string
  tagline: string
  shopLanguage: string
  codMin: number
  codBlockedPincodes: string[]
  gstin: string | null
  defaultHsn: string
  invoiceSeries: string
  /** The shop's logo (Settings › Brand, S1·6): its 400-wide WebP in the brand folder. */
  logoUrl?: string | null
  docLogo: string | null
  docSignatory: string
  docNote: string
  slipSize: string
  /** The published look's paper tokens and display face, for the brand and footer previews (Settings › Brand). */
  look?: { vars: Record<string, string>; display: string }
}

const inr = (p: number) => formatInr(paise(p))

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure className="overflow-hidden rounded-md border border-border">
      <figcaption className="flex justify-between border-b border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
        <span className="truncate font-mono">{label}</span><span>Live preview</span>
      </figcaption>
      {children}
    </figure>
  )
}

function Missing({ children }: { children: React.ReactNode }) {
  return <span className="rounded-sm bg-danger px-1 text-danger-text">{children}</span>
}

export { Pieces } from '@/components/storefront/policy'

export function FooterPreview({ f }: { f: ShopFacts }) {
  return (
    <Frame label="Footer on every page">
      <div data-store-theme="" data-accent={f.accent} style={f.look?.vars} className="space-y-1.5 p-4 text-[13px] leading-relaxed">
        <b className="block text-base" style={{ fontFamily: f.look?.display ?? displayFamily(f.displayFont) }}>{f.shopName}</b>
        {f.tagline && <p className="text-store-sub">{f.tagline}</p>}
        <p>Contact · Shipping · Returns · Privacy · Terms</p>
        <p className="text-store-sub">{f.legalName || <Missing>legal business name</Missing>} · {f.address || <Missing>registered address</Missing>}</p>
        <p className="text-store-sub">Grievance officer: {f.grievanceName || <Missing>not set</Missing>}</p>
        <p className="text-store-sub">Orders are numbered <span className="font-mono">{orderPrefix(f.orderPrefix, f.shopName)}-1001</span></p>
      </div>
    </Frame>
  )
}

export function BrandPreview({ f }: { f: ShopFacts }) {
  return (
    <Frame label={`${f.slug}.${f.shopDomain}`}>
      <div data-store-theme="" data-accent={f.accent} style={f.look?.vars}>
        <div className="flex items-center justify-between border-b border-store-line px-4 py-2.5">
          <span className="text-[15px] font-semibold tracking-[0.14em]" style={{ fontFamily: f.look?.display ?? displayFamily(f.displayFont) }}>{f.shopName.toUpperCase()}</span>
          <span className="size-2 rounded-full bg-store-accent" aria-label="Your accent colour" />
        </div>
        <div className="space-y-2 p-4">
          <div className="aspect-[4/5] w-full rounded-sm bg-store-chip" aria-hidden="true" />
          <p className="text-lg" style={{ fontFamily: f.look?.display ?? displayFamily(f.displayFont) }}>Linen kurta set</p>
          <p className="font-mono text-sm">₹2,490</p>
          <div className="flex gap-1.5">{['S', 'M', 'L'].map((s, i) => <span key={s} className={`grid h-9 w-11 place-items-center rounded-sm border text-sm ${i === 1 ? 'border-store-ink' : 'border-store-line'}`}>{s}</span>)}</div>
          <span className="grid h-10 place-items-center rounded-sm bg-store-ink text-sm text-white">Add to bag</span>
          {f.tagline && <p className="text-xs text-store-sub">{f.tagline}</p>}
          <p className="text-xs text-store-sub">The button stays ink so it always reads; your colour marks small details.</p>
        </div>
      </div>
    </Frame>
  )
}

export function ContactPreview({ f }: { f: ShopFacts }) {
  return <PolicyPreview f={f} page="contact" />
}

export function PolicyPreview({ f, page, override }: { f: ShopFacts; page: PolicyPage; override?: string | null }) {
  const title = POLICY_TITLE[page]
  return (
    <Frame label={`${f.slug}.${f.shopDomain}/${page === 'contact' ? 'contact' : `policies/${page}`}`}>
      <div data-store-theme="" data-accent={f.accent} className="space-y-2.5 p-4 text-[13px] leading-relaxed">
        <b className="block text-lg font-medium" style={{ fontFamily: f.look?.display ?? displayFamily(f.displayFont) }}>{title}</b>
        <PolicyBody page={page} facts={f} override={override} />
        {page === 'contact' && f.whatsapp && <p className="underline">Message {f.shopName} on WhatsApp</p>}
      </div>
    </Frame>
  )
}

/** A ₹2,490 bag to an Indore pincode, priced by the shop's own rules. */
export function CheckoutPreview({ f }: { f: ShopFacts }) {
  const bag = 249000
  const ship = shippingFor(bag, f)
  const cod = codFor(bag, f)
  const codTotal = cod.offered ? cod.total : bag + ship + f.codCharge
  const why = cod.offered || cod.reason === 'off' ? null : codWhyNot(cod, inr)
  return (
    <Frame label="Checkout · a ₹2,490 bag to 452018">
      <div data-store-theme="" data-accent={f.accent} className="space-y-2 p-4 text-[13px]">
        <p className="text-xs text-store-sub">Dispatched within {f.dispatchDays} day{f.dispatchDays === 1 ? '' : 's'} · arrives in up to {f.restDays} days</p>
        <div className="flex justify-between"><span>Bag</span><span className="font-mono">{inr(bag)}</span></div>
        <div className="flex justify-between"><span>Shipping</span><span className="font-mono">{ship ? inr(ship) : 'Free'}</span></div>
        <div className="rounded-sm border border-store-ink p-2">UPI, card or netbanking · <b className="font-mono">{inr(bag + ship)}</b></div>
        {f.codOn && (
          <div className={`rounded-sm border border-store-line p-2 ${why ? 'text-store-sub' : ''}`}>
            Pay on delivery{why ? <><br /><span className="text-xs text-store-bad">{why}</span></>
              : <> · <b className="font-mono">{inr(codTotal)}</b>{f.codCharge > 0 && <><br /><span className="text-xs">Includes a {inr(f.codCharge)} Pay on delivery fee</span></>}</>}
          </div>
        )}
        {f.codOn && f.codBlockedPincodes.length > 0 && <p className="text-xs text-store-sub">Not offered to {f.codBlockedPincodes.length} pincode{f.codBlockedPincodes.length === 1 ? '' : 's'} you listed.</p>}
        <p className="text-xs text-store-sub">{f.pricesIncludeGst ? 'Prices include GST.' : 'GST is added to these prices.'}</p>
      </div>
    </Frame>
  )
}

export function InvoicePreview({ f, fiscalYear }: { f: ShopFacts; fiscalYear: string }) {
  const registered = !!f.gstin && gstinValid(f.gstin)
  return (
    <Frame label="Your next invoice">
      <div className="space-y-2 bg-white p-4 text-[13px] text-[color:var(--store-ink)]">
        <b className="block text-[15px]">{registered ? 'Tax invoice' : 'Bill of supply'}</b>
        <p className="font-mono text-xs">{f.invoiceSeries}{fiscalYear}/0001</p>
        <p>{f.legalName || <Missing>legal business name</Missing>}<br /><span className="text-store-sub">{f.address || <Missing>registered address</Missing>}</span>{registered && <><br />GSTIN <span className="font-mono">{f.gstin}</span></>}</p>
        <p className="text-xs text-store-sub">{registered ? `HSN ${f.defaultHsn} · CGST and SGST inside your state, IGST outside` : 'Not registered for GST: no tax is charged or shown.'}</p>
        {(f.docNote || f.docSignatory) && (
          <div className="flex items-end justify-between gap-3 border-t border-store-line pt-2 text-xs">
            <span className="text-store-sub">{f.docNote}</span>
            <span className="shrink-0 text-right">For {f.legalName || f.shopName}<br />Authorised signatory{f.docSignatory ? ` · ${f.docSignatory}` : ''}</span>
          </div>
        )}
      </div>
    </Frame>
  )
}
