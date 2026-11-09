import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { displayFamily, STORE_FONT_VARS } from '@/components/shop-preview/fonts'
import { ShopIcon } from '@/components/storefront/icon'
import { POLICY_TITLE } from '@/components/storefront/policy'
import { ICON_NAMES } from '@/domains/icons/names'
import { ICON_LIBRARIES, paletteOf, paletteProblem } from '@/domains/themes/site'
import { manifestOf } from '@/domains/themes/catalogue'
import { choicesOf } from '@/domains/themes/choices'
import { needsSamples, SAMPLE_FIRST } from '@/lib/themes/sample'
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
  const [data, shop] = await Promise.all([editorData(t), previewShop(t)])
  if (!shop) redirect('/console/look')
  // No open draft: if this person just published it (this page re-renders after Publish), say so and offer Undo;
  // otherwise (Discard, a bookmark, someone else published) back to Look.
  if (!data) {
    const j = await justPublished(t, auth.userId, new Date())
    if (!j) redirect('/console/look')
    return <Published liveId={j.liveId} address={shop.host} shopOpen={!!shop.publishedAt} undoFrom={j.canUndo && (CAN_MANAGE as readonly string[]).includes(role) ? j.liveId : null} />
  }
  const m = manifestOf(data.draft.themeKey, data.draft.themeVersion)
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
  ]
  // The preview shows sample pieces (and so a sample page) only when the theme has them and the shop lists few of its own.
  const sampled = !!m.samples && needsSamples(data.products.length)
  const schemeNames = m.styles.find((s) => s.key === draft.style)?.schemeNames ?? {}
  return (
    <div className={STORE_FONT_VARS}>
      <Editor
        revisionId={data.draft.id} version={data.draft.version} themeName={m.name} style={draft.style}
        // Site settings and menus only once set (absent = the theme's own and the default menus: Look v4).
        layer={{ settings: draft.settings, home: draft.home, ...(stored.site !== undefined ? { site: draft.site } : {}), ...(stored.menus !== undefined ? { menus: draft.menus } : {}) }}
        site={draft.site}
        presets={m.styles.map((s) => ({ name: s.name, palette: paletteOf(s.schemes.paper) })).filter((x) => !paletteProblem(x.palette))}
        // The shop's icons, drawn here on the server (their path data never reaches a browser as data).
        icons={Object.fromEntries(ICON_LIBRARIES.map((l) => [l, Object.fromEntries(ICON_NAMES.map((n) => [n, <ShopIcon key={n} name={n} set={{ library: l, stroke: 'regular' }} />]))])) as never}
        styles={m.styles.map((s) => ({ key: s.key, name: s.name, swatches: [s.schemes.paper.accent, s.schemes.tint?.bg ?? s.schemes.paper.chip, s.schemes.ink?.bg ?? s.schemes.paper.text], light: [s.schemes.paper, s.schemes.tint ?? s.schemes.paper] }))}
        allowed={{ pairings: m.allowed.pairings, headers: m.allowed.headers, footers: m.allowed.footers, sections: m.allowed.sections }} made={m.made ?? {}}
        facts={{ collections: f.collections, codOn: f.codOn, freeShippingAbove: f.freeShippingAbove, returnDays: f.returnDays, dispatchDays: f.dispatchDays }}
        formCtx={{ tenantId: t, targets, collections: data.collections, products: data.products, photos: data.photos, shopName: shop.shopName, masks: m.allowed.heroMasks ?? ['none'], promiseWords,
          schemes: [{ key: 'paper', name: schemeNames.paper ?? 'Paper' }, { key: 'tint', name: schemeNames.tint ?? 'Tint' }, { key: 'ink', name: schemeNames.ink ?? 'Ink' }] }}
        targets={targets} fonts={Object.fromEntries(PAIRINGS.map((p) => [p, displayFamily(p)])) as Record<Pairing, string>}
        address={shop.host} canPublish={(CAN_MANAGE as readonly string[]).includes(role)} shopOpen={!!shop.publishedAt} nowIso={new Date().toISOString()}
        // A theme with samples (2.0): with no piece or collection of its own yet, the page picker opens a sample one.
        firstProduct={data.products[0]?.handle ?? (sampled ? SAMPLE_FIRST.product : null)} firstCollection={data.collections[0]?.handle ?? (sampled ? SAMPLE_FIRST.collection : null)}
        choices={choicesOf(m)}
      />
    </div>
  )
}
