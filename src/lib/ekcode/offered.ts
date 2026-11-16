import 'server-only'
import type { ModuleAccess } from '@/domains/modules/access'
import type { ModuleKey } from '@/domains/modules/registry'
import { ekcodeConfigured } from './keys'

/** A shop's checkout offers EkCode: the shop has it usable (on by default unless turned off) and EkCode itself is
 *  configured (its number, keys, host). Read by the start gate, the privacy page and Settings. The checkout's button
 *  applies the same two halves apart: the slot fills only for a usable module (src/components/modules/slots.tsx) and
 *  EkcodeCheckout draws nothing unless configured. A condition added here is added there too. */
export const ekcodeOffered = (access: Record<ModuleKey, ModuleAccess>): boolean => ekcodeConfigured() && access.ekcode.usable
