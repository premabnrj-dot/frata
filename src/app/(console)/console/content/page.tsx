import type { Metadata } from 'next'
import { PageHeader } from '@/components/layout/page-header'
import { Banner } from '@/components/ui/banner'
import { button } from '@/components/ui/button'
import { Icon } from '@/components/icons/icon'
import { Panel } from '@/components/ui/panel'
import { ViewTabs } from '@/components/ui/view-tabs'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { contentEditorData } from '@/lib/queries/content'
import { previewLook, previewShop, shopAnnouncement } from '@/lib/queries/storefront'
import { manifestsFor } from '@/lib/themes/manifests'
import { themeOf } from '@/lib/themes/page-look'
import { offerBarLive } from '@/components/storefront/announce-bar'
import { barText } from '@/domains/checkout/offer-text'
import { barChip, type BarChip } from '@/domains/content/bar'
import { CONTACT_KEY, MENU_KEYS, readBar, readContactLine, readMenu, type MenuKey } from '@/domains/content/kinds'
import { contentSaver } from '@/domains/content/who'
import { ROLE_LABEL } from '@/domains/tenancy/roles'
import { POLICY_TITLE } from '@/components/storefront/policy'
import { BOUND, answerText, boundAnswer } from '@/domains/policies/answers'
import { POLICY_PAGES } from '@/domains/policies/render'
import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'
import { dayMonthIN, momentIN } from '@/lib/format-date'
import { draftOf } from '@/lib/themes/pages'
import { FAQ_ID, TEMPLATES, type FaqItem, type PageTemplate } from '@/domains/pages/templates'
import { menusOf, type MenuItem } from '@/domains/themes/site'
import { Bars, type BarRow } from './_components/bars'
import { Menus } from './_components/menus'
import { Pages, type PageRowView } from './_components/pages'
import { Faq } from './_components/faq'
import { ContactLine } from './_components/contact'

export const metadata: Metadata = { title: 'Content' }
export const dynamic = 'force-dynamic'

// =============================================================================
// CONSOLE › CONTENT (V1, plan docs/plans/2026-11-15-v1-content.md; owner-approved final mockup 2026-11-15
// https://claude.ai/artifact/6WemLUPWd2z9rPXsVRzTv4). What the store says, saved live: Announcement, Menus, Pages, FAQ,
// Contact line. Everyone in the store reads it; who saves is src/domains/content/who.ts (the actions check it again).
// Chips and dates are worked out here, on the server, from one `now` (never the browser's clock).
// =============================================================================

const TABS = ['announcement', 'menus', 'pages', 'faq', 'contact'] as const
type Tab = (typeof TABS)[number]
const TAB_NAMES: Record<Tab, string> = { announcement: 'Announcement', menus: 'Menus', pages: 'Pages', faq: 'FAQ', contact: 'Contact line' }
const CHIP: Record<BarChip, { tone: 'ok' | 'info' | 'neutral'; label: string }> = {
  live: { tone: 'ok', label: 'Live now' }, after_offer: { tone: 'neutral', label: 'Shows after the offer' }, behind: { tone: 'neutral', label: 'Shows after the newer bar' },
  scheduled: { tone: 'info', label: 'Starts' }, ended: { tone: 'neutral', label: 'Ended' }, stopped: { tone: 'neutral', label: 'Ended early' },
}
/** A moment as the datetime-local field holds it, in India time. */
const local = (d: Date | null) => (d ? new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 16) : '')

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const t = auth.membership.tenantId
  const asked = (await searchParams).tab
  const tab: Tab = (TABS as readonly string[]).includes(asked ?? '') ? (asked as Tab) : 'announcement'
  const now = new Date()
  const read = await Promise.all([contentEditorData(t, auth.userId), previewShop(t), shopAnnouncement(t).catch(() => null), previewLook(t), manifestsFor(t)])
    .catch((err) => { console.error('[content]', err instanceof Error ? err.name : 'error'); return null })
  if (!read) return <Panel title="We couldn’t load this screen">Nothing was changed. Try again in a minute.</Panel>
  const [data, shop, offer, look, src] = read
  // A store whose settings aren't made yet (a partner's new store): its content waits for them.
  if (!shop) return <Panel title="Set up your store first" action={<a href="/console/setup" className={button({ variant: 'secondary' })}>Open setup</a>} />
  const saver = contentSaver(auth.membership.role, auth.membership.supportSessionId)
  const canSave = saver === 'yes'
  // Who can, said as roles (the console has no names): the owner, a Manager or the store's partner (owner, 2026-11-15).
  // A support visit says so once, in the banner (as drawn), not on every section.
  // Only roles this store has: the partner is named only where there is one (words review 2026-11-15).
  const lock = canSave || saver === 'support' ? null : data.hasPartner
    ? `Only the ${ROLE_LABEL.owner.toLowerCase()}, a ${ROLE_LABEL.admin} or the ${ROLE_LABEL.partner.toLowerCase()} can edit`
    : `Only the ${ROLE_LABEL.owner.toLowerCase()} or a ${ROLE_LABEL.admin} can edit`

  // ── Announcement ─────────────────────────────────────────────────────────────────────────────────────────────
  const offerLive = offerBarLive(offer, now)
  const written = data.rows.filter((r) => r.kind === 'announcement').flatMap((r) => { const v = readBar(r.value); return v ? [{ ...r, ...v }] : [] })
  const bars: BarRow[] = written.map((b) => {
    const chip = barChip(b, offerLive, written, now)
    const c = CHIP[chip]
    return {
      id: b.id, version: b.version, text: b.text, link: b.link, scheme: b.scheme, startsAt: local(b.startsAt), endsAt: local(b.endsAt),
      // A phone shows the day alone (as drawn: "Starts 1 Dec"); a computer the day and time.
      chip: chip === 'scheduled' && b.startsAt ? { tone: c.tone, label: `Starts ${momentIN(b.startsAt, now)}`, short: `Starts ${dayMonthIN(b.startsAt)}` } : { ...c, short: c.label },
      ends: b.endsAt && chip !== 'ended' && chip !== 'stopped' ? `Ends ${momentIN(b.endsAt, now)}` : null,
      endsShort: b.endsAt && chip !== 'ended' && chip !== 'stopped' ? `Ends ${dayMonthIN(b.endsAt)}` : null,
      undoable: b.by === 'You' && now.getTime() - b.updatedAt.getTime() < 60_000,
    }
  })
  const offerRow = offer && offerLive ? { text: barText(offer, { code: offer.code, endsAt: offer.endsAt ? new Date(offer.endsAt) : null }), ends: offer.endsAt ? `Ends ${dayMonthIN(new Date(offer.endsAt))}` : null } : null

  // ── Links a bar or a menu may open ───────────────────────────────────────────────────────────────────────────
  const pages = data.pages.map((p) => ({ ...p, d: draftOf(p) }))
  const targets = [
    { path: '/', label: 'Home' }, { path: '/products', label: 'Shop all' },
    ...data.collections.map((c) => ({ path: `/collections/${c.handle}`, label: `Collection · ${c.title}` })),
    ...data.products.map((p) => ({ path: `/products/${p.handle}`, label: `Product · ${p.title}` })),
    ...(['shipping', 'returns', 'privacy', 'terms', 'contact'] as const).map((k) => ({ path: `/policies/${k}`, label: k === 'contact' ? 'Contact' : `Policy · ${POLICY_TITLE[k]}` })),
    ...pages.flatMap((p) => (p.d && p.live ? [{ path: `/pages/${p.d.handle}`, label: `Page · ${p.d.title}` }] : [])),
  ]

  // ── Menus ────────────────────────────────────────────────────────────────────────────────────────────────────
  const theme = themeOf(shop, look, src)
  const menus = Object.fromEntries(MENU_KEYS.map((k) => {
    const r = data.rows.find((x) => x.kind === 'menu' && x.key === k)
    // No row yet: the main menu the store shows today (Shop all and its collections), the others empty.
    const items = (r ? readMenu(k, r.value) : null) ?? (k === 'main' ? menusOf(undefined, data.collections).main ?? [] : [])
    return [k, { version: r?.version ?? null, items, id: r?.id ?? null }]
  })) as Record<MenuKey, { version: number | null; items: MenuItem[]; id: string | null }>

  // ── Pages and the FAQ ────────────────────────────────────────────────────────────────────────────────────────
  const pageRows: PageRowView[] = pages.flatMap((p) => (p.template !== 'faq' && p.d ? [{ id: p.id, version: p.version, template: p.template as PageTemplate, draft: p.d, shown: !!p.live }] : []))
  const faqRow = pages.find((p) => p.template === 'faq')
  const faqItems: FaqItem[] = faqRow?.d && Object.hasOwn(faqRow.d.fill, FAQ_ID) && faqRow.d.fill[FAQ_ID]!.kind === 'faq' ? (faqRow.d.fill[FAQ_ID] as { items: FaqItem[] }).items : []
  const policyTitle = Object.fromEntries(POLICY_PAGES) as Record<string, string>
  const answers = Object.fromEntries(BOUND.map((b) => { const a = boundAnswer(b, shop, shop.overrides, (x) => formatInr(paise(x))); return [b, !a ? null : 'policy' in a ? `See your ${policyTitle[a.policy]} policy` : answerText(a.pieces)] })) as Record<(typeof BOUND)[number], string | null>

  // ── The Contact line ─────────────────────────────────────────────────────────────────────────────────────────
  const contactRow = data.rows.find((x) => x.kind === 'contact' && x.key === CONTACT_KEY)
  const phone = (x: string) => (x ? `+91 ${x.slice(0, 5)} ${x.slice(5)}` : '')
  const details = [shop.legalName || shop.shopName, shop.address, phone(shop.whatsapp)].filter(Boolean).join(' · ')

  const ctx = { tenantId: t, targets, collections: data.collections, products: data.products, photos: data.photos, shopName: shop.shopName }
  return (
    <div className="space-y-5">
      {/* As drawn: on a phone the header is the title alone. */}
      <PageHeader title="Content" meta={<span className="hidden font-mono text-small md:inline">{shop.host}</span>}
        actions={<a href={`https://${shop.host}`} target="_blank" rel="noreferrer" className={`${button({ variant: 'secondary' })} max-md:hidden`}><Icon name="external" className="size-4" />View store</a>} />
      <ViewTabs label="Content" scroll tabs={TABS.map((k) => ({ href: `/console/content?tab=${k}`, label: TAB_NAMES[k], current: k === tab }))} />
      {saver === 'support' && <Banner tone="warn" title="Support visit · read only" />}
      {tab === 'announcement' && <Bars bars={bars} offer={offerRow} canSave={canSave} lock={lock} targets={targets} />}
      {tab === 'menus' && <Menus menus={menus} canSave={canSave} lock={lock} targets={targets} tabsOn={theme.settings.bottomTabs} splitHeader={theme.settings.header === 'split'} />}
      {tab === 'pages' && <Pages pages={pageRows} canSave={canSave} lock={lock} ctx={ctx} templates={{ about: TEMPLATES.about }} />}
      {tab === 'faq' && <Faq id={faqRow?.id ?? null} version={faqRow?.version ?? null} items={faqItems} answers={answers} canSave={canSave} lock={lock} />}
      {tab === 'contact' && <ContactLine id={contactRow?.id ?? null} version={contactRow?.version ?? null} line={(contactRow && readContactLine(contactRow.value)?.line) ?? ''} details={details} canSave={canSave} lock={lock} />}
    </div>
  )
}
