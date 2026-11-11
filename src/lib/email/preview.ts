import 'server-only'
import { shopLook, shopSettingsFor } from '@/lib/queries/storefront'
import { themeOf } from '@/lib/themes/page-look'
import { manifestsFor } from '@/lib/themes/manifests'
import { paperAccent } from '@/domains/documents/paper'
import type { OrderMessage } from '@/domains/messaging/events'
import type { EmailWords } from '@/domains/email/words'
import { composeOrderEmail } from './compose'

// =============================================================================
// FILE: src/lib/email/preview.ts — WHAT AN ORDER EMAIL LOOKS LIKE FOR THIS SHOP, on a sample order (Settings › Emails
// to shoppers). Built by the same composeOrderEmail the sender uses. Shown in <iframe sandbox="" srcdoc>: no scripts,
// no same origin (security review M1).
// =============================================================================

export async function previewOrderEmail(tenantId: string, kind: OrderMessage, words: Partial<EmailWords> | null) {
  const shop = await shopSettingsFor(tenantId)
  if (!shop) return null
  const [look, src] = await Promise.all([shopLook(tenantId).catch(() => null), manifestsFor(tenantId)])
  const now = new Date()
  const cod = kind !== 'finish_paying'
  return composeOrderEmail({
    kind, shop, accent: paperAccent(themeOf(shop, look, src).schemes.paper.accent),
    order: { id: '00000000-0000-0000-0000-000000000000', number: 1043, total: 249000, customerName: 'Asha Rao', placedAt: now, paymentMethod: cod ? 'cod' : 'prepaid',
      payBy: null, paidAt: null, switchedToCodAt: null, confirmedAt: null, heldAt: null, packedAt: null, cancelledAt: kind === 'cancelled' ? now : null,
      shippedAt: kind === 'shipped' || kind === 'delivered' ? now : null, ndrAt: null, deliveredAt: kind === 'delivered' ? now : null, lostAt: null,
      rtoInitiatedAt: null, rtoDeliveredAt: null, stockShort: false },
    lines: [{ title: 'Chanderi kurta set', values: ['Rust', 'M'], qty: 1 }],
    ship: { courier: 'Delhivery', tracking: '1490 2231 0094' }, own: words, to: 'asha@example.com', replyTo: shop.supportEmail || 'support@example.com',
  })
}
