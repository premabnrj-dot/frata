import 'server-only'
import { shopModules } from '@/lib/queries/modules'
import { ekcodeOffered } from '@/lib/ekcode/offered'

/** EkCode may run at this shop: `ekcodeOffered` (usable, on by default unless turned off, and configured). */
export async function ekcodeOnAt(tenantId: string): Promise<boolean> {
  return shopModules(tenantId, new Date().toISOString()).then((m) => ekcodeOffered(m.access)).catch(() => false)
}
