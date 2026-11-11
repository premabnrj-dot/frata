import 'server-only'
import { addOnAllowed, type ModuleAccess, type ModuleFacts } from '@/domains/modules/access'
import { offerFor, type Offer } from '@/domains/modules/offer'
import { MODULES, type ModuleKey } from '@/domains/modules/registry'
import { frataWhatsappLink } from '@/lib/site'
import type { appsPage } from '@/lib/queries/modules'

type Page = Awaited<ReturnType<typeof appsPage>>

/** The app it needs turned on first, for an app that is granted but off (never a switch that fails: review A3). */
function neededFirst(k: ModuleKey, access: Record<ModuleKey, ModuleAccess>): ModuleKey | null {
  const a = access[k]
  if (!a.granted || a.on) return null
  return MODULES[k].dependsOn.find((d) => !access[d].usable) ?? null
}

/** The one offer for an app, from the page's one read (the card, the filters and the page all read this). */
export function offerOf(k: ModuleKey, d: Page, now: Date): Offer {
  return offerFor(k, d.access[k], d.prices[k]?.monthlyPrice ?? null, now, addOnAllowed(k, (d.facts as ModuleFacts).planCode), d.asked.has(k), neededFirst(k, d.access))
}

export function aboutProps(k: ModuleKey, d: Page, now: Date, canManage: boolean, shopName: string) {
  return {
    k, offer: offerOf(k, d, now), canManage,
    worksWith: MODULES[k].dependsOn.map((x) => ({ key: x, name: MODULES[x].name, on: d.access[x].usable })),
    askHref: frataWhatsappLink(`Hi Frrata, please add ${MODULES[k].name} to ${shopName}.`),
  }
}
