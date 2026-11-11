import 'server-only'
import { addOnAllowed } from '@/domains/modules/access'
import { offerFor, type Offer } from '@/domains/modules/offer'
import { MODULES, type ModuleKey } from '@/domains/modules/registry'
import { frataWhatsappLink } from '@/lib/site'
import { CAN_MANAGE } from '@/domains/tenancy/roles'
import type { appsPage } from '@/lib/queries/modules'

type Page = Awaited<ReturnType<typeof appsPage>>

/** The one offer for an app, from the page's one read (the card, the filters and the page all read this). */
export function offerOf(k: ModuleKey, d: Page, now: Date): Offer {
  return offerFor(k, d.access[k], d.prices[k]?.monthlyPrice ?? null, now, addOnAllowed(k, d.facts.planCode), d.asked.has(k))
}

export function aboutProps(k: ModuleKey, d: Page, now: Date, canManage: boolean, shopName: string) {
  return {
    k, offer: offerOf(k, d, now), canManage,
    worksWith: MODULES[k].dependsOn.map((x) => ({ key: x, name: MODULES[x].name, on: d.access[x].usable })),
    askHref: frataWhatsappLink(`Hi Frrata, please add ${MODULES[k].name} to ${shopName}.`),
  }
}

/** Who sees Turn off on an app's home: exactly who setModuleAction lets turn one off (owners and admins, never a
 *  Frrata support visit; Apps A2). */
export function mayTurnOff(m: { role: string; supportSessionId: string | null }): boolean {
  return (CAN_MANAGE as readonly string[]).includes(m.role) && !m.supportSessionId
}
