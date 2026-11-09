import Link from 'next/link'
import type { FooterVariant } from '@/domains/themes/types'
import { wordsFor, type Words } from './words'
import { Photo } from './photo'

import type { Href, ShellShop, StripPiece } from './shell'

// The shop's footers (split from shell.tsx for theme Signal, plan S1-2; no visible change).

const waLink = (n: string) => `https://wa.me/${n.replace(/\D/g, '')}`
const igLink = (h: string) => `https://instagram.com/${h.replace(/^@/, '')}`

/** The footer on every page (inside the shell, which sets --store-display). */
export function ShopFooter({ f, href, variant = 'three', social = true, w = wordsFor(f.shopLanguage), painted = false, strip = [] }: { f: ShellShop; href: Href; variant?: FooterVariant; social?: boolean; w?: Words
  /** Painted in another scheme (footer colours, 2.0): its own background, edge to edge. */
  painted?: boolean; strip?: StripPiece[] }) {
  if (variant === 'gram') return <StripFooter f={f} href={href} social={social} w={w} painted={painted} strip={strip} />
  if (variant === 'compact') return <CompactFooter f={f} href={href} social={social} w={w} painted={painted} />
  if (variant === 'statement') return <StatementFooter f={f} href={href} social={social} w={w} painted={painted} />
  return (
    <footer className={`mt-16 border-t border-store-line ${painted ? 'bg-store-paper text-store-ink' : 'bg-store-chip/50'}`}>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-3 sm:px-6">
        <div className="space-y-2">
          <p className="text-lg" style={{ fontFamily: 'var(--store-display)' }}>{f.shopName}</p>
          {f.tagline && <p className="text-store-sub">{f.tagline}</p>}
          {social && <p className="flex gap-4">
            {f.instagram && <a href={igLink(f.instagram)} rel="noopener" className="underline underline-offset-4">Instagram</a>}
            {f.whatsapp && <a href={waLink(f.whatsapp)} rel="noopener" className="underline underline-offset-4">WhatsApp</a>}
          </p>}
        </div>
        <nav aria-label={w.policiesNav}><ul className="space-y-1.5">
          {(['shipping', 'returns', 'privacy', 'terms', 'contact'] as const).map((k) => <li key={k}><Link href={href(`/policies/${k}`)} className="hover:underline">{w.policy[k]}</Link></li>)}
        </ul></nav>
        <div className="space-y-1 text-store-sub">
          {f.legalName && <p>{f.legalName}</p>}
          {f.address && <p className="whitespace-pre-line">{f.address}</p>}
          {f.grievanceName && <p>{`${w.grievance}: `}{f.grievanceName}{f.grievanceEmail ? `, ${f.grievanceEmail}` : ''}</p>}
        </div>
      </div>
    </footer>
  )
}

/** One column on every width. The policies, legal name, address and grievance officer stay: the law, not a setting. */
export function CompactFooter({ f, href, social, w, painted }: { f: ShellShop; href: Href; social: boolean; w: Words; painted: boolean }) {
  return (
    <footer className={`mt-16 border-t border-store-line ${painted ? 'bg-store-paper text-store-ink' : ''}`}>
      <div className="mx-auto max-w-6xl space-y-3 px-4 py-8 text-center text-sm sm:px-6">
        <p className="text-base" style={{ fontFamily: 'var(--store-display)' }}>{f.shopName}</p>
        <nav aria-label={w.policiesNav}><ul className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          {(['shipping', 'returns', 'privacy', 'terms', 'contact'] as const).map((k) => <li key={k}><Link href={href(`/policies/${k}`)} className="hover:underline">{w.policy[k]}</Link></li>)}
        </ul></nav>
        {social && (f.instagram || f.whatsapp) && <p className="flex justify-center gap-4">
          {f.instagram && <a href={igLink(f.instagram)} rel="noopener" className="underline underline-offset-4">Instagram</a>}
          {f.whatsapp && <a href={waLink(f.whatsapp)} rel="noopener" className="underline underline-offset-4">WhatsApp</a>}
        </p>}
        <p className="text-store-sub">{[f.legalName, f.address?.replace(/\n/g, ', '), f.grievanceName ? `${w.grievance}: ${f.grievanceName}${f.grievanceEmail ? `, ${f.grievanceEmail}` : ''}` : ''].filter(Boolean).join(' · ')}</p>
      </div>
    </footer>
  )
}

/** Statement (2.0): the shop's name set large, then every legal fact the other footers carry (none is removed). */
export function StatementFooter({ f, href, social, w, painted }: { f: ShellShop; href: Href; social: boolean; w: Words; painted: boolean }) {
  return (
    <footer className={`mt-16 overflow-hidden border-t border-store-line ${painted ? 'bg-store-paper text-store-ink' : ''}`}>
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 text-sm sm:px-6 sm:py-14">
        <div className="grid gap-8 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-2">
            {f.tagline && <p className="max-w-sm text-base text-store-sub">{f.tagline}</p>}
            {social && <p className="flex gap-4">
              {f.instagram && <a href={igLink(f.instagram)} rel="noopener" className="underline underline-offset-4">Instagram</a>}
              {f.whatsapp && <a href={waLink(f.whatsapp)} rel="noopener" className="underline underline-offset-4">WhatsApp</a>}
            </p>}
          </div>
          <nav aria-label={w.policiesNav}><ul className="space-y-1.5">
            {(['shipping', 'returns', 'privacy', 'terms', 'contact'] as const).map((k) => <li key={k}><Link href={href(`/policies/${k}`)} className="hover:underline">{w.policy[k]}</Link></li>)}
          </ul></nav>
          <div className="space-y-1 text-store-sub">
            {f.legalName && <p>{f.legalName}</p>}
            {f.address && <p className="whitespace-pre-line">{f.address}</p>}
            {f.grievanceName && <p>{`${w.grievance}: `}{f.grievanceName}{f.grievanceEmail ? `, ${f.grievanceEmail}` : ''}</p>}
          </div>
        </div>
        <p aria-hidden="true" className="truncate border-t border-store-line pt-6 text-[clamp(2.5rem,11vw,8rem)] leading-none tracking-tight" style={{ fontFamily: 'var(--store-display)' }}>{f.shopName}</p>
      </div>
    </footer>
  )
}

/** Instagram strip (2.1): the newest pieces' photos in a row (each opens its page), the shop's Instagram, then the
 *  compact footer's legal lines (none is removed). No Instagram embed: the photos are the shop's own. */
export function StripFooter({ f, href, social, w, painted, strip }: { f: ShellShop; href: Href; social: boolean; w: Words; painted: boolean; strip: StripPiece[] }) {
  return (
    <div className="mt-16">
      {strip.length > 0 && (
        <div className="border-t border-store-line">
          <ul className="grid grid-cols-3 gap-0.5 sm:grid-cols-6">
            {strip.slice(0, 6).map((p) => (
              <li key={p.handle}><Link href={href(`/products/${p.handle}`)} className="group relative block aspect-square overflow-hidden bg-store-chip">
                <Photo p={p.image} alt={p.title} sizes="(min-width: 640px) 17vw, 33vw" className="absolute inset-0 h-full w-full object-cover" />
              </Link></li>
            ))}
          </ul>
          {social && f.instagram && <p className="py-3 text-center text-sm"><a href={igLink(f.instagram)} rel="noopener" className="underline underline-offset-4">@{f.instagram.replace(/^@/, '')}</a></p>}
        </div>
      )}
      <div className="-mt-16"><CompactFooter f={f} href={href} social={social} w={w} painted={painted} /></div>
    </div>
  )
}
