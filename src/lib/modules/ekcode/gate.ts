import 'server-only'
import { shopModules } from '@/lib/queries/modules'
import { ekcodeConfigured } from '@/lib/ekcode/keys'

/** EkCode may run at this shop: the shop has it on (Apps) and EkCode itself is configured (its number, keys, host). */
export async function ekcodeOnAt(tenantId: string): Promise<boolean> {
  if (!ekcodeConfigured()) return false
  return shopModules(tenantId, new Date().toISOString()).then((m) => m.access.ekcode.usable).catch(() => false)
}
