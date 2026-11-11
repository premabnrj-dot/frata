import { choicesFor } from '@/domains/themes/choices'
import { isVideoConfigured } from '@/lib/env'
import { PRODUCT_LAYOUTS, SECTION_SCHEMES } from '@/domains/themes/sections'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { displayFamily, STORE_FONT_VARS } from '@/components/shop-preview/fonts'
import { ShopIcon } from '@/components/storefront/icon'
import { POLICY_TITLE } from '@/components/storefront/policy'
import { ICON_NAMES } from '@/domains/icons/names'
import { ICON_LIBRARIES, paletteOf, paletteProblem } from '@/domains/themes/site'
import { manifestOf } from '@/domains/themes/source'
import { manifestsFor } from '@/lib/themes/manifests'
import { choicesOf } from '@/domains/themes/choices'
import { needsSamples, sampleFirst, sampleSetFor } from '@/lib/themes/sample'
import { truePromises } from '@/domains/themes/readiness'
import { resolveTheme } from '@/domains/themes/resolve'
import { PROMISES } from '@/domains/themes/sections'
import { PAIRINGS, type Pairing } from '@/domains/themes/types'
import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'
import { ANY_MEMBER, CAN_BUILD, CAN_MANAGE, requireMember } from '@/lib/auth/require-member'
import { editorData, justPublished } from '@/lib/queries/look'
import { previewShop } from '@/lib/queries/storefront'
import { Editor } from './editor'
import { Published } from './published'
import { DesignThumb } from './design-thumb'
import { designsOf, isCommerce } from '@/domains/themes/blocks'
import { pagesForEditor } from '@/lib/queries/pages'
import { TEMPLATES } from '@/domains/pages/templates'
import type { Design } from '@/domains/themes/blocks'

/** The FAQ's picture: a heading over its questions (its template's own blocks are only the line above). */
const FAQ_THUMB = { children: [{ id: 'h', kind: 'heading', size: 'l', text: 'FAQ' }, { id: 'q', kind: 'accordion', items: [1, 2, 3, 4].map((n) => ({ q: `Q${n}`, a: '' })) }] } as unknown as Pick<Design, 'children'>
import { BOUND, answerText, boundAnswer } from '@/domains/policies/answers'
import { POLICY_PAGES } from '@/domains/policies/render'

// The customizer page: its own route group (no console chrome: the shop is the canvas). Only an editor of the look
// (owner, admin, partner; not a support visit) gets here; the draft must exist (Look's Customize makes it).
export const metadata: Metadata = { title: 'Customize · Look', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function Customize() {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) redirect('/login')
  const role = auth.membership.role, support = !!auth.membership.supportSessionId
  if (!(CAN_BUILD as readonly string[]).includes(role) || support) redirect('/console/look')
  const t = auth.membership.tenantId
  const [data, shop, src, pages] = await Promise.all([editorData(t), previewShop(t), manifestsFor(t), pagesForEditor(t)])
  if (!shop) redirect('/console/look')
  // No open draft: if this person just published it (this page re-renders after Publish), say so and offer Undo;
  // otherwise (Discard, a bookmark, someone else published) back to Look.
  if (!data) {
    const j = await justPublished(t, auth.userId, new Date())
    if (!j) redirect('/console/look')
    return <Published liveId={j.liveId} address={shop.host} shopOpen={!!shop.publishedAt} undoFrom={j.canUndo && (CAN_MANAGE as readonly string[]).includes(role) ? j.liveId : null} />
  }
  const m = manifestOf(src, data.draft.themeKey, data.draft.themeVersion)
  if (!m) redirect('/console/look')
  const stored = data.draft.settings as { settings?: object; home?: unknown[]; site?: unknown; menus?: unknown }
  const draft = resolveTheme(m, { style: data.draft.styleKey, ...stored })
  const f = data.facts
  const tp = truePromises(f)
  const promiseWords = Object.fromEntries(PROMISES.map((k) => [k, {
    true: tp.includes(k),
    text: k === 'cod' ? 'Pay on delivery' : k === 'free_shipping' ? (f.freeShippingAbove !== null ? `Free shipping above ${formatInr(paise(f.freeShippingAbove))}` : 'Free shipping above a price') : k === 'returns' ? `${f.returnDays}-day exchange or returns` : `Ships in ${f.dispatchDays} days`,
  }])) as Record<(typeof PROMISES)[number], { text: string; true: boolean }>
  const targets = [
    { path: '/', label: 'Home' }, { path: '/products', label: 'Shop all' },
    ...data.collections.map((c) => ({ path: `/collections/${c.handle}`, label: `Collection: ${c.title}` })),
    ...data.products.map((p) => ({ path: `/products/${p.handle}`, label: `Product: ${p.title}` })),
    ...(['shipping', 'returns', 'privacy', 'terms', 'contact'] as const).map((k) => ({ path: `/policies/${k}`, label: POLICY_TITLE[k] })),
    // TS1a: the shop's pages (a hidden one 404s until shown: the link waits for it).
    ...pages.filter((x) => !x.draft.removed).map((x) => ({ path: `/pages/${x.draft.handle}`, label: `Page: ${x.draft.title}` })),
  ]
  // The preview shows sample pieces (and so a sample page) only when the theme has them and the shop lists few of its own.
  const sampled = !!m.samples && needsSamples(data.products.length)
  const first = sampleFirst(sampleSetFor(f.sells))
  const schemeNames = m.styles.find((s) => s.key === draft.style)?.schemeNames ?? {}
  // TS0b: the theme's designs (parsed), and each one's picture drawn here (never the drawing code in the browser).
  const designs = designsOf(m)
  // TS1a: Contact's facts from Settings (read-only in the form), and the FAQ's answers from the policies.
  const phone = (x: string) => (x ? `+91 ${x.slice(0, 5)} ${x.slice(5)}` : '')
  const contactRows = [
    { label: 'WhatsApp', value: shop.whatsapp ? phone(shop.whatsapp) : null },
    { label: 'Shop', value: shop.legalName ? `${shop.shopName}, run by ${shop.legalName}` : null },
    { label: 'Address', value: shop.address || null },
    { label: 'Customer care', value: [shop.supportEmail, phone(shop.supportPhone)].filter(Boolean).join(' · ') || null },
    { label: 'Grievance officer', value: shop.grievanceName ? [shop.grievanceName + (shop.grievanceRole ? `, ${shop.grievanceRole}` : ''), shop.grievanceEmail, phone(shop.grievancePhone)].filter(Boolean).join(' · ') : null },
  ]
  const policyTitle = Object.fromEntries(POLICY_PAGES) as Record<string, string>
  const answers = Object.fromEntries(BOUND.map((b) => { const a = boundAnswer(b, shop, shop.overrides, (x) => formatInr(paise(x))); return [b, !a ? null : 'policy' in a ? `See your ${policyTitle[a.policy]} policy` : answerText(a.pieces)] })) as Record<(typeof BOUND)[number], string | null>
  return (
    <div className={STORE_FONT_VARS}>
      <Editor
        revisionId={data.draft.id} version={data.draft.version} themeName={m.name} style={draft.style}
        // Site settings and menus only once set (absent = the theme's own and the default menus: Look v4).
        layer={{ settings: draft.settings, home: draft.home, ...(stored.site !== undefined ? { site: draft.site } : {}), ...(stored.menus !== undefined ? { menus: draft.menus } : {}), ...(draft.contact ? { contact: draft.contact } : {}) }}
        site={draft.site}
        presets={m.styles.map((s) => ({ name: s.name, palette: paletteOf(s.schemes.paper) })).filter((x) => !paletteProblem(x.palette))}
        // The shop's icons, drawn here on the server (their path data never reaches a browser as data).
        icons={Object.fromEntries(ICON_LIBRARIES.map((l) => [l, Object.fromEntries(ICON_NAMES.map((n) => [n, <ShopIcon key={n} name={n} set={{ library: l, stroke: 'regular' }} />]))])) as never}
        styles={m.styles.map((s) => ({ key: s.key, name: s.name, swatches: [s.schemes.paper.accent, s.schemes.tint?.bg ?? s.schemes.paper.chip, s.schemes.ink?.bg ?? s.schemes.paper.text], light: [s.schemes.paper, s.schemes.tint ?? s.schemes.paper] }))}
        allowed={{ pairings: m.allowed.pairings, headers: m.allowed.headers, footers: m.allowed.footers, sections: m.allowed.sections }} made={m.made ?? {}}
        facts={{ collections: f.collections, codOn: f.codOn, freeShippingAbove: f.freeShippingAbove, returnDays: f.returnDays, dispatchDays: f.dispatchDays }}
        formCtx={{ tenantId: t, targets, collections: data.collections, products: data.products, photos: data.photos, shopName: shop.shopName, masks: m.allowed.heroMasks ?? ['none'], layouts: m.allowed.productLayouts ?? PRODUCT_LAYOUTS, labels: (choicesFor(m, 'labels') ?? ['none']).some((x) => x !== 'none'), promiseWords,
          video: { sections: m.allowed.videoSections ?? [], on: isVideoConfigured() }, spotlight: (m.allowed.imageTextLayouts ?? []).includes('spotlight'), heroScript: !!m.allowed.heroScript, designs: Object.fromEntries(designs.map((d) => [d.id, d])),
          schemes: ([{ key: 'paper', name: schemeNames.paper ?? 'Paper' }, { key: 'tint', name: schemeNames.tint ?? 'Tint' }, { key: 'ink', name: schemeNames.ink ?? 'Ink' }, { key: 'signal', name: 'Your colour' }] as const).filter((x) => (m.allowed.sectionSchemes ?? SECTION_SCHEMES).includes(x.key)) }}
        targets={targets} fonts={Object.fromEntries(PAIRINGS.map((p) => [p, displayFamily(p)])) as Record<Pairing, string>}
        address={shop.host} canPublish={(CAN_MANAGE as readonly string[]).includes(role)} shopOpen={!!shop.publishedAt} nowIso={new Date().toISOString()}
        // A theme with samples (2.0): with no piece or collection of its own yet, the page picker opens a sample one.
        firstProduct={data.products[0]?.handle ?? (sampled ? first.product : null)} firstCollection={data.collections[0]?.handle ?? (sampled ? first.collection : null)}
        choices={choicesOf(m)}
        designs={designs.map((d) => ({ id: d.id, name: d.name, line: d.line, tags: d.tags, commerce: isCommerce(d), thumb: <DesignThumb design={d} /> }))}
        pages={pages} pageThumbs={{ about: <DesignThumb design={TEMPLATES.about} />, faq: <DesignThumb design={FAQ_THUMB} /> }} contactRows={contactRows} answers={answers}
      />
    </div>
  )
}
