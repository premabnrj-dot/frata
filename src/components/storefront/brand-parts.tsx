import { brandFamily } from '@/components/shop-preview/font-families'
import { FIELD_HEIGHT, type BrandRecord } from '@/domains/brand/record'
import type { CheckoutDesign } from '@/domains/brand/checkout'
import type { PolicyFacts } from '@/domains/policies/render'
import { POLICY_TITLE } from './policy-titles'

// =============================================================================
// FILE: src/components/storefront/brand-parts.tsx — THE BRAND FRAME'S PARTS, PURE (one-address plan P2·3, P2·5): the
// record as the store's tokens, the logo, the header and the footer with its legal block. The live pages (brand-frame.tsx)
// and Console › Brand › Checkout's preview (checkout-preview.tsx) draw the same parts. Rules: brand-css.ts.
// =============================================================================

/** The store's facts the frame draws; `supportPhone` already as people read it (formatPhone, on the server). */
export type BrandFacts = Pick<PolicyFacts, 'shopName' | 'legalName' | 'address' | 'supportEmail' | 'supportPhone' | 'grievanceName' | 'grievanceEmail'>

/** The record as the store's tokens: the checkout, order and policy views read only these. */
export function brandStyle(b: BrandRecord): React.CSSProperties {
  const p = b.palette
  return {
    '--store-paper': p.bg, '--store-ink': p.text, '--store-sub': p.muted, '--store-line': p.line, '--store-chip': p.panel,
    '--store-good': p.good, '--store-bad': p.bad, '--store-warn': p.warn, '--store-accent': p.accent, '--store-on-accent': p.on,
    // The one primary is the accent (House of Ayuda's system: its accent only on the one primary).
    '--store-button': p.accent, '--store-on-button': p.on, '--store-sale': p.bad, '--store-edge': p.edge,
    '--store-radius': `${b.radius}px`, '--store-field': `${FIELD_HEIGHT[b.density]}px`,
    '--store-display': brandFamily(b.display), '--store-body': brandFamily(b.body),
  } as React.CSSProperties
}

const POLICIES = ['shipping', 'returns', 'privacy', 'terms', 'contact'] as const

/** The logo from the record (only ever through <img>), else the store's name in the display face. */
export function BrandLogo({ record, name }: { record: BrandRecord; name: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- the store's own logo file from its media folder, only ever through <img>
  return record.logos.main ? <img src={record.logos.main} alt={name} className="bf-logo" /> : <span className="bf-name">{name}</span>
}

/** Logo left or centred; "Back to <store>" on or off (beside a centred logo it is an arrow on a phone, named for readers). */
export function BrandHeader({ record, design, name, home, link = true }: { record: BrandRecord; design: Pick<CheckoutDesign, 'header' | 'back'>; name: string
  /** Where the logo and the back link go: the store's own website, else its Frrata home. */
  home: string
  /** The bag-link page: the logo alone, centred, not a link. */
  link?: boolean }) {
  const centre = !link || design.header === 'centre', back = link && design.back, words = `Back to ${name}`
  return (
    <header className="bf-hd">
      <div className={centre ? 'bf-hw c' : 'bf-hw'}>
        {centre && back && <a href={home} aria-label={words} className="bf-back"><svg viewBox="0 0 24 24" aria-hidden="true" className="bf-ic"><path d="M20 12H5M10.5 6.5 5 12l5.5 5.5" /></svg><span aria-hidden="true">{words}</span></a>}
        {link ? <a href={home} className="bf-home"><BrandLogo record={record} name={name} /></a> : <span className="bf-home"><BrandLogo record={record} name={name} /></span>}
        {!centre && <><span className="bf-sp" />{back && <a href={home} className="bf-back">{words}</a>}</>}
      </div>
    </header>
  )
}

/** The policy links in one row or two, and the legal block, always. */
export function BrandFooter({ facts: f, rows }: { facts: BrandFacts; rows: CheckoutDesign['rows'] }) {
  const care = [f.supportEmail, f.supportPhone].filter(Boolean).join(' · ')
  return (
    <footer className="bf-ft">
      <div className="bf-fw">
        <nav aria-label="Policies"><ul className={rows === 2 ? 'two' : undefined}>
          {POLICIES.map((k) => <li key={k}><a href={`/policies/${k}`}>{POLICY_TITLE[k]}</a></li>)}
        </ul></nav>
        <dl>
          <div><dt>Sold by</dt><dd>{f.legalName || f.shopName}{f.address ? <><br />{f.address}</> : null}</dd></div>
          {care && <div><dt>Customer care</dt><dd>{care}</dd></div>}
          {f.grievanceName && <div><dt>Grievance officer</dt><dd>{f.grievanceName}{f.grievanceEmail ? `, ${f.grievanceEmail}` : ''}</dd></div>}
        </dl>
      </div>
    </footer>
  )
}
