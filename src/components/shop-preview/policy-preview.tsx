import type { PolicyPage } from '@/domains/policies/pages'
import { PolicyBody, POLICY_TITLE } from '@/components/storefront/policy'
import { displayFamily } from './fonts'
import { Frame, type ShopFacts } from './previews'

// The policy and contact previews, apart from previews.tsx so Settings loads the policy templates only on the sections
// that draw them (next/dynamic in settings-form.tsx).
export function ContactPreview({ f }: { f: ShopFacts }) {
  return <PolicyPreview f={f} page="contact" />
}

export function PolicyPreview({ f, page, override }: { f: ShopFacts; page: PolicyPage; override?: string | null }) {
  const title = POLICY_TITLE[page]
  return (
    <Frame label={`${f.slug}.${f.shopDomain}/policies/${page}`}>
      <div data-store-theme="" data-accent={f.accent} className="space-y-2.5 p-4 text-[13px] leading-relaxed">
        <b className="block text-lg font-medium" style={{ fontFamily: f.look?.display ?? displayFamily(f.displayFont) }}>{title}</b>
        {/* As the shop shows it (TS1a): Chat on WhatsApp above the details. */}
        {page === 'contact' && f.whatsapp && <p><span className="inline-flex min-h-8 items-center rounded-[var(--store-radius)] bg-store-button px-3 text-xs font-medium text-store-on-button">Chat on WhatsApp</span></p>}
        <PolicyBody page={page} facts={f} override={override} />
      </div>
    </Frame>
  )
}

