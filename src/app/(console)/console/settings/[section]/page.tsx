import { notFound, redirect } from 'next/navigation'
import { Panel } from '@/components/ui/panel'
import { fiscalYear } from '@/domains/counters/fiscal-year'
import { formValues, sectionFor } from '@/domains/settings/sections'
import { CAN_BUILD, requireMember } from '@/lib/auth/require-member'
import { SHOP_DOMAIN } from '@/lib/public-env'
import { ownerOnlyFacts, pickupPlace, policyOverrides, shopWithSettings } from '@/lib/queries/settings'
import { ASK_PAGES, OWNER_ONLY_WORDS, lockOf, lockedFor, mayAskOwner, type AskPage } from '@/domains/settings/owner-only'
import { Badge } from '@/components/ui/badge'
import { AskOwner } from '../_components/ask-owner'
import { liveWithoutRate } from '@/lib/queries/catalogue'
import { chargesGst, type Scheme } from '@/domains/tax/gst'
import { previewLook } from '@/lib/queries/storefront'
import { resolveStored, schemeVars } from '@/domains/themes/resolve'
import { codeSource } from '@/domains/themes/source'
import { manifestsFor } from '@/lib/themes/manifests'
import { displayFamily } from '@/components/shop-preview/fonts'
import { shopFacts, storedValues } from '../_components/facts'
import { SettingsForm } from '../_components/settings-form'
import { SettingsHead } from '../_components/settings-head'
import { movedTo } from '@/domains/settings/groups'
import { pinSuggestionFor } from '@/lib/queries/pin-returns'
import { errName } from '@/lib/log'
import { HELD_BY_ZONES } from '@/domains/delivery/lists'
import { shopModules } from '@/lib/queries/modules'
import { ekcodeOffered } from '@/lib/ekcode/offered'

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }) {
  return { title: sectionFor((await params).section)?.title ?? 'Settings' }
}

export default async function SettingsSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const auth = await requireMember(CAN_BUILD)
  if (!auth.ok) return <Panel title={auth.reason === 'no_access' ? 'You can’t change this store’s settings' : auth.message} />
  const { section: key } = await params
  // Settings regrouped (owner, 2026-11-15): an old address goes to the page that holds its fields now.
  const moved = movedTo(key)
  if (moved) redirect(`/console/settings/${moved}`)
  const section = sectionFor(key)
  if (!section) notFound()
  if (!section.editors.includes(auth.membership.role)) return <Panel title="Only the owner or a manager can change this" />
  const tenantId = auth.membership.tenantId
  const zoned = section.key === 'shipping' || section.key === 'payments'
  // PP1: the pages with owner-only settings ask whether the store has an owner, and, for a partner who may ask, whether
  // this page was asked about today. A failed read fails closed: locked as if the store had an owner.
  const role = auth.membership.role, support = !!auth.membership.supportSessionId
  const askPage = (ASK_PAGES as readonly string[]).includes(section.key) ? (section.key as AskPage) : null
  const now = new Date()
  const owned = askPage
    ? ownerOnlyFacts(tenantId, mayAskOwner(role, true, support) ? askPage : null, now).catch((err) => { console.error('[settings owner-only]', errName(err)); return { hasOwner: true, askedToday: false } })
    : Promise.resolve(null)
  const [shop, overrides, live, src, mods, suggest, ownerOnly, place] = await Promise.all([
    shopWithSettings(tenantId),
    section.key === 'policies' ? policyOverrides(tenantId) : Promise.resolve({}),
    section.preview === 'brand' || section.preview === 'footer' ? previewLook(tenantId) : Promise.resolve(null),
    manifestsFor(tenantId),
    zoned ? shopModules(tenantId, new Date().toISOString())
      // Policies reads it only for the privacy preview's EkCode paragraph: a failed read leaves it out, never the page.
      : section.key === 'policies' ? shopModules(tenantId, new Date().toISOString()).catch((err) => { console.error('[settings modules]', errName(err)); return null })
      : Promise.resolve(null),
    // Best effort: without it the page shows no suggestion, never an error.
    section.key === 'payments' ? pinSuggestionFor(tenantId, new Date()).catch((err) => { console.error('[settings pin]', errName(err)); return null }) : Promise.resolve(null),
    owned,
    // Store details only: the saved pickup PIN code's city and state (one statement, beside the rest; best effort).
    section.key === 'store' ? pickupPlace(tenantId).catch((err) => { console.error('[settings pickup]', errName(err)); return null }) : Promise.resolve(null),
  ]).catch((err) => { console.error('[settings section]', key, errName(err)); return [null, {}, null, codeSource, null, null, null, null] as const })
  if (!shop) return <Panel title="We couldn’t load this screen">Nothing was changed. Try again in a minute.</Panel>
  // The brand and footer previews wear the shop's published look (Look owns colours and type now).
  // Taxes: a shop that charges GST can't sell a live product with no rate (quote); say which, never block (best effort).
  const unrated = section.key === 'business' && chargesGst({ gstin: shop.settings.gstin, scheme: shop.settings.gstScheme as Scheme })
    ? await liveWithoutRate(tenantId, new Date()).catch((err) => { console.error('[settings taxes] unrated', errName(err)); return null })
    : null
  const theme = resolveStored(live, shop.settings, src)
  const facts = { ...shopFacts(shop, SHOP_DOMAIN, !!mods && ekcodeOffered(mods.access)), look: { vars: schemeVars(theme, 'paper'), display: displayFamily(theme.settings.pairing) } }
  const lock = ownerOnly ? lockOf(lockedFor(role, ownerOnly.hasOwner, support), section.key, shop.settings as unknown as Record<string, unknown>) : null
  const ask = askPage && ownerOnly && lock && mayAskOwner(role, ownerOnly.hasOwner, support) ? { page: askPage, asked: ownerOnly.askedToday } : null
  // A page locked whole says so beside its title, with Ask the owner as the header's one action; a page locked in part
  // keeps its own header (Contact: the block holds them; Invoices and slips: Ask the owner in the header, a chip by each).
  const inBlock = section.key === 'contact'
  return (
    <SettingsForm
      sectionKey={section.key}
      head={<SettingsHead page={section.key} role={auth.membership.role}
        badges={lock?.whole ? <Badge>{OWNER_ONLY_WORDS.chip}</Badge> : undefined}
        actions={ask && !inBlock ? <AskOwner page={ask.page} asked={ask.asked} /> : undefined} />}
      lock={lock}
      ask={ask && inBlock ? ask : null}
      suggest={suggest}
      initial={formValues(section, { ...storedValues(facts), pickupPincode: shop.settings.pickupPincode })}
      place={place}
      version={shop.settings.version}
      facts={facts}
      fiscalYear={fiscalYear(new Date())}
      overrides={overrides}
      tenantId={tenantId}
      held={mods?.access.delivery_zones.usable ? HELD_BY_ZONES : []}
      unrated={unrated}
    />
  )
}
