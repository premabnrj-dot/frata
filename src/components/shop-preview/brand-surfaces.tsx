'use client'

import type React from 'react'
import { brandFamily } from './brand-fonts'
import { PAPER } from '@/domains/documents/paper'
import { FIELD_HEIGHT, type BrandRecord } from '@/domains/brand/record'
import { formatInr } from '@/lib/format'
import type { Paise } from '@/domains/money/paise'

// =============================================================================
// FILE: src/components/shop-preview/brand-surfaces.tsx — Console › Brand's preview (one-address P1·8; mockup § Preview): the record drawn as the store's own surfaces will draw it, on sample data
// from the store (its first listed product, its name, its legal name). Every colour, font, corner and height here is
// the RECORD's, never the console's tokens: the strip sits under [data-store-theme], which every Neel rule skips.
// =============================================================================

export type Sample = { shopName: string; product: { title: string; price: number; mrp: number | null; photo: string | null } | null
  paper: { legalName: string; address: string; gstin: string | null; prefix: string } }
export const PREVIEWS = ['Website', 'Checkout', 'Email', 'Invoice'] as const
export type PreviewName = (typeof PREVIEWS)[number]

/** The record as CSS variables, for every surface below. */
export function brandVars(b: BrandRecord): React.CSSProperties {
  const p = b.palette
  return { '--st-bg': p.bg, '--st-panel': p.panel, '--st-text': p.text, '--st-muted': p.muted, '--st-accent': p.accent, '--st-on': p.on, '--st-edge': p.edge,
    '--st-line': p.line, '--st-r': `${b.radius}px`, '--st-display': brandFamily(b.display), '--st-body': brandFamily(b.body),
    // The preview's fields are drawn 8 px shorter than the store's (44, 48, 52), to fit the strip.
    '--st-field': `${FIELD_HEIGHT[b.density] - 8}px` } as React.CSSProperties
}

const box = 'overflow-hidden rounded-md border border-border bg-[var(--st-bg)] font-[family-name:var(--st-body)] text-[13px]/[1.45] text-[var(--st-text)]'

function Mark({ b, name, h }: { b: BrandRecord; name: string; h: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- the store's own logo file from its media folder, only ever through <img>
  return b.logos.main ? <img src={b.logos.main} alt={name} style={{ height: h }} className="w-auto max-w-[180px] object-contain" />
    : <span className="font-[family-name:var(--st-display)] text-[20px] leading-none">{name}</span>
}

const price = (s: Sample) => (s.product ? formatInr(s.product.price as Paise) : null)

export function PreviewSurface({ which, b, s }: { which: PreviewName; b: BrandRecord; s: Sample }) {
  const amount = price(s)
  if (which === 'Website') return (
    <div className={box} style={brandVars(b)} data-pv="Website">
      <div className="flex min-h-13 items-center gap-2.5 border-b border-[var(--st-line)] px-3 py-2.5">
        <Mark b={b} name={s.shopName} h={30} /><span className="flex-1" />
        <span className="inline-flex items-center gap-1 text-[12px]"><svg viewBox="0 0 24 24" aria-hidden="true" className="size-4.5 fill-none stroke-current stroke-[1.5]"><path d="M5 8.5h14l-1 11.5H6L5 8.5Z" /><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5" /></svg>Bag</span>
      </div>
      {s.product && (
        <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-2.5 px-3 py-2.5">
          <span className="block h-24 w-16 overflow-hidden bg-[var(--st-panel)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- the store's own product photo, 400 px */}
            {s.product.photo && <img src={s.product.photo} alt="" width={64} height={96} loading="lazy" className="size-full object-cover object-[50%_20%]" />}
          </span>
          <div className="min-w-0">
            <p className="font-[family-name:var(--st-display)] text-[17px]/[1.2]">{s.product.title}</p>
            <p className="font-semibold tabular-nums">{amount}</p>
            {s.product.mrp && <p className="text-[11.5px] text-[var(--st-muted)]">M.R.P. {formatInr(s.product.mrp as Paise)} (inclusive of all taxes)</p>}
          </div>
        </div>
      )}
    </div>
  )
  if (which === 'Checkout') return (
    <div className={box} style={brandVars(b)} data-pv="Checkout">
      <div className="flex min-h-13 items-center gap-2.5 border-b border-[var(--st-line)] px-3 py-2.5">
        <Mark b={b} name={s.shopName} h={28} /><span className="flex-1" /><span className="text-[12px] underline underline-offset-3">Back to {s.shopName}</span>
      </div>
      <div className="flex flex-col gap-2 p-3">
        <h3 className="font-[family-name:var(--st-display)] text-[22px]/[1.15] font-normal">Checkout</h3>
        <span className="text-[11px] font-semibold tracking-[.08em] text-[var(--st-muted)] uppercase">Contact</span>
        <span className="flex h-[var(--st-field)] items-center rounded-[var(--st-r)] border border-[var(--st-edge)] px-2.5 text-[12px] text-[var(--st-muted)]">Mobile number</span>
      </div>
      <div className="flex flex-col gap-1.5 border-t border-[var(--st-line)] px-3 py-2.5">
        <div className="flex justify-between text-[12px]"><span className="text-[var(--st-muted)]">Pay on delivery</span><b className="tabular-nums">{amount ?? '₹0'}</b></div>
        <div className="grid h-[var(--st-field)] place-items-center rounded-[var(--st-r)] bg-[var(--st-accent)] text-[13px] font-semibold text-[var(--st-on)] tabular-nums">Place order · {amount ?? '₹0'}</div>
      </div>
    </div>
  )
  if (which === 'Email') return (
    <div className={box} style={brandVars(b)} data-pv="Email">
      <div className="grid justify-items-center gap-1.5 border-b border-[var(--st-line)] bg-[var(--st-panel)] px-3 py-3.5">
        {/* eslint-disable-next-line @next/next/no-img-element -- the store's own logo file, through <img> only */}
        {b.logos.stacked ?? b.logos.main ? <img src={(b.logos.stacked ?? b.logos.main)!} alt={s.shopName} className="h-16 w-auto max-w-[180px] object-contain" /> : <span className="font-[family-name:var(--st-display)] text-[20px] leading-none">{s.shopName}</span>}
      </div>
      <div className="flex flex-col gap-1.5 p-3">
        <h4 className="font-[family-name:var(--st-display)] text-[19px] font-normal">Thank you, Priya</h4>
        <p className="text-[var(--st-muted)]">Order {s.paper.prefix || 'AY'}-1042 is placed. Keep {amount ?? '₹0'} ready.</p>
      </div>
    </div>
  )
  return (
    <div className={box} style={brandVars(b)} data-pv="Invoice">
      {/* Paper is white whatever the record says: an invoice prints on white (documents/paper.ts). */}
      <div className="grid gap-1.5 p-3 font-sans text-[12px]" style={{ background: PAPER.white, color: PAPER.ink }}>
        <div className="flex items-start justify-between gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- the store's own logo file, through <img> only */}
          {b.logos.main ? <img src={b.logos.main} alt={s.shopName} className="h-6.5 w-auto max-w-[140px] object-contain" /> : <b>{s.paper.legalName || s.shopName}</b>}
          <span className="text-right"><b className="text-[13px]">Tax invoice</b><br /><span className="font-mono text-[11px]">{(s.paper.prefix || 'AY').toUpperCase()}/26-27/0001</span></span>
        </div>
        <p>{s.paper.legalName || s.shopName}<br /><span className="text-[11px]" style={{ color: PAPER.sub }}>{s.paper.address}{s.paper.gstin && <> · GSTIN <span className="font-mono text-[11px]">{s.paper.gstin}</span></>}</span></p>
      </div>
    </div>
  )
}

/** The store's name in its headings font, where no logo is yet (mockup screen 2). */
export function BrandName({ b, name }: { b: BrandRecord; name: string }) {
  return <span className="text-[28px] leading-none" style={{ fontFamily: brandFamily(b.display) }}>{name}</span>
}

/** Type's sample line: a product's name in the headings font, a line in the body font, on the record's background. */
export function BrandTypeLine({ b, title, line }: { b: BrandRecord; title: string; line: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-line-soft px-3 py-2.5" style={{ background: b.palette.bg, color: b.palette.text }} data-typeline="">
      <span className="text-[24px]/[1.2]" style={{ fontFamily: brandFamily(b.display) }}>{title}</span>
      <span className="text-[15px]/[1.5]" style={{ fontFamily: brandFamily(b.body), color: b.palette.muted }}>{line}</span>
    </div>
  )
}
