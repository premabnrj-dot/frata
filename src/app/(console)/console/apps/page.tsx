import { PageHeader } from '@/components/layout/page-header'
import { Panel } from '@/components/ui/panel'
import { offerFor } from '@/domains/modules/offer'
import { GROUPS, MODULE_KEYS, MODULES } from '@/domains/modules/registry'
import { ANY_MEMBER, CAN_MANAGE, requireMember } from '@/lib/auth/require-member'
import { addonPriceList, shopModules } from '@/lib/queries/modules'
import { frataWhatsappLink } from '@/lib/site'
import { AppsList, type AppRow } from './apps-list'

export const metadata = { title: 'Apps' }

/** Console › Apps (approved mockup v2, screens 1–3): every module, what it costs, one switch or one action. */
export default async function AppsPage() {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const now = new Date()
  const tenantId = auth.membership.tenantId
  const loaded = await Promise.all([shopModules(tenantId, now.toISOString()), addonPriceList(tenantId)])
    .catch((err) => { console.error('[apps]', err instanceof Error ? err.name : 'error'); return null })
  if (!loaded) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  const [{ access }, prices] = loaded
  const rows: AppRow[] = MODULE_KEYS.map((key) => {
    const def = MODULES[key], a = access[key]
    return {
      key, name: def.name, job: def.job, group: def.group, features: [...def.features], usage: def.usage ?? null,
      worksWith: def.dependsOn.map((d) => ({ name: MODULES[d].name, on: access[d].usable })),
      offer: offerFor(key, a, prices[key]?.monthlyPrice ?? null, now),
      ask: frataWhatsappLink(`Hi Frrata, please add ${def.name} to ${auth.membership.tenantName}.`),
    }
  })
  const on = MODULE_KEYS.filter((k) => access[k].usable).length
  return (
    <>
      <PageHeader title="Apps" />
      <p className="-mt-2 text-sm text-muted-foreground">{on ? `${on} on` : 'Nothing on yet'} · tap an app for what it does and what it costs</p>
      <AppsList groups={GROUPS.map(([k, label]) => ({ key: k, label }))} rows={rows} canManage={(CAN_MANAGE as readonly string[]).includes(auth.membership.role)} />
    </>
  )
}
