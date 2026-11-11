import 'server-only'
import { addOnAllowed } from '@/domains/modules/access'
import { offerFor, type Offer } from '@/domains/modules/offer'
import { MODULES, type ModuleKey } from '@/domains/modules/registry'
import { frataWhatsappLink } from '@/lib/site'
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
