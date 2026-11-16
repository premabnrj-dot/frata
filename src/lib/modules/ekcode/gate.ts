import 'server-only'
import { shopModules } from '@/lib/queries/modules'
import { ekcodeConfigured } from '@/lib/ekcode/keys'
import { ekcodeOffered } from '@/lib/ekcode/offered'

/** EkCode may run at this shop: the shop has it on (Apps) and EkCode itself is configured (its number, keys, host). */
export async function ekcodeOnAt(tenantId: string): Promise<boolean> {
  if (!ekcodeConfigured()) return false
  return shopModules(tenantId, new Date().toISOString()).then((m) => ekcodeOffered(m.access)).catch(() => false)
}
