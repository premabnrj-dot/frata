import { notFound } from 'next/navigation'
import { Panel } from '@/components/ui/panel'
import { fiscalYear } from '@/domains/counters/fiscal-year'
import { formValues, sectionFor } from '@/domains/settings/sections'
import { CAN_BUILD, requireMember } from '@/lib/auth/require-member'
import { SHOP_DOMAIN } from '@/lib/public-env'
import { policyOverrides, shopWithSettings } from '@/lib/queries/settings'
import { previewLook } from '@/lib/queries/storefront'
import { resolveStored, schemeVars } from '@/domains/themes/resolve'
import { displayFamily } from '@/components/shop-preview/fonts'
import { shopFacts, storedValues } from '../_components/facts'
import { SettingsForm } from '../_components/settings-form'
import { errName } from '@/lib/log'

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }) {
  return { title: sectionFor((await params).section)?.title ?? 'Settings' }
}

export default async function SettingsSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const auth = await requireMember(CAN_BUILD)
  if (!auth.ok) return <Panel title={auth.reason === 'no_access' ? 'You can’t change this shop’s settings' : auth.message} />
  const { section: key } = await params
  const section = sectionFor(key)
  if (!section) notFound()
  if (!section.editors.includes(auth.membership.role)) return <Panel title="Only the owner or an admin can change this" />
  const tenantId = auth.membership.tenantId
  const [shop, overrides, live] = await Promise.all([
    shopWithSettings(tenantId),
    section.key === 'policies' ? policyOverrides(tenantId) : Promise.resolve({}),
    section.preview === 'brand' || section.preview === 'footer' ? previewLook(tenantId) : Promise.resolve(null),
  ]).catch((err) => { console.error('[settings section]', key, errName(err)); return [null, {}, null] as const })
  if (!shop) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  // The brand and footer previews wear the shop's published look (Look owns colours and type now).
  const theme = resolveStored(live, shop.settings)
  const facts = { ...shopFacts(shop, SHOP_DOMAIN), look: { vars: schemeVars(theme, 'paper'), display: displayFamily(theme.settings.pairing) } }
  return (
    <SettingsForm
      sectionKey={section.key}
      initial={formValues(section, storedValues(facts))}
      version={shop.settings.version}
      facts={facts}
      fiscalYear={fiscalYear(new Date())}
      overrides={overrides}
    />
  )
}
