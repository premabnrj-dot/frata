import type { ComponentType } from 'react'
import type { ModuleAccess } from '@/domains/modules/access'
import type { ModuleKey } from '@/domains/modules/registry'
import { shopModules } from '@/lib/queries/modules'
import { EkcodeCheckout } from '@/components/modules/ekcode/checkout-identity'

// =============================================================================
// FILE: src/components/modules/slots.tsx — where modules plug into core pages.
//
// docs/specs/2026-11-07-modules-foundation.md § 4. A core page renders
// <Slot name="order.side" …/> and never imports a module; this map says which
// module fills which slot (check:modules allows imports of module code only
// here and at the other named hook points). A filler renders only when its
// module is usable for the shop (moduleAccess). Three slots for now (YAGNI,
// architecture review 2026-11-07); a module adds its line here when it ships.
// =============================================================================

export const SLOT_NAMES = ['order.side', 'home.tile', 'checkout.identity'] as const
export type SlotName = (typeof SLOT_NAMES)[number]
export type SlotContext = { tenantId: string; orderId?: string }

type Filler = { module: ModuleKey; Component: ComponentType<SlotContext> }
const FILLERS: Record<SlotName, Filler[]> = {
  'order.side': [],
  'home.tile': [],
  // Above the guest form on a shop's checkout (EkCode P1): the button, the holdout, and the signed-in strip.
  'checkout.identity': [{ module: 'ekcode', Component: EkcodeCheckout }],
}

export function Slot({ name, ctx, access }: { name: SlotName; ctx: SlotContext; access: Record<ModuleKey, ModuleAccess> }) {
  const live = FILLERS[name].filter((f) => access[f.module].usable)
  if (!live.length) return null
  return <>{live.map(({ module, Component }) => <Component key={module} {...ctx} />)}</>
}

/**
 * The slot as a core page uses it: reads the shop's module access (cached per request) only when something fills
 * the slot, so an empty slot costs nothing. `at` is the page's render time (check:clock).
 */
export async function ModuleSlot({ name, ctx, at }: { name: SlotName; ctx: SlotContext; at: string }) {
  if (!FILLERS[name].length) return null
  const { access } = await shopModules(ctx.tenantId, at)
  return <Slot name={name} ctx={ctx} access={access} />
}
