import { notFound } from 'next/navigation'
import { Panel } from '@/components/ui/panel'
import { fiscalYear } from '@/domains/counters/fiscal-year'
import { formValues, sectionFor } from '@/domains/settings/sections'
import { CAN_MANAGE, requireMember } from '@/lib/auth/require-member'
import { SHOP_DOMAIN } from '@/lib/public-env'
import { policyOverrides, shopWithSettings } from '@/lib/queries/settings'
import { shopFacts, storedValues } from '../_components/facts'
import { SettingsForm } from '../_components/settings-form'

export default async function SettingsSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const auth = await requireMember(CAN_MANAGE)
  if (!auth.ok) return <Panel title={auth.reason === 'no_access' ? 'Only the owner or an admin can change settings' : auth.message} />
  const { section: key } = await params
  const section = sectionFor(key)
  if (!section) notFound()
  const tenantId = auth.membership.tenantId
  const [shop, overrides] = await Promise.all([
    shopWithSettings(tenantId),
    section.key === 'policies' ? policyOverrides(tenantId) : Promise.resolve({}),
  ]).catch((err) => { console.error('[settings section]', key, err); return [null, {}] as const })
  if (!shop) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  const facts = shopFacts(shop, SHOP_DOMAIN)
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
