import 'server-only'
import type { ModuleAccess } from '@/domains/modules/access'
import type { ModuleKey } from '@/domains/modules/registry'
import { ekcodeConfigured } from './keys'

/** A shop's checkout offers EkCode: the shop has it usable (on by default unless turned off) and EkCode itself is
 *  configured (its number, keys, host). The one rule, read by the gate, the privacy page and Settings. */
export const ekcodeOffered = (access: Record<ModuleKey, ModuleAccess>): boolean => ekcodeConfigured() && access.ekcode.usable
