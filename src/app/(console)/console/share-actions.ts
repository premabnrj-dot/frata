'use server'

import QRCode from 'qrcode'
import { asMember } from '@/lib/auth/as-member'
import { ANY_MEMBER } from '@/lib/auth/require-member'
import { shareFor, type ShareTarget } from '@/lib/seo/share'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * A QR code for one of the member's own pages (search and sharing S1·7). Takes the page's kind and id only — never a
 * URL or text — so it can only ever encode this shop's address (never a Frrata-made QR for someone else's site).
 */
export async function shareQr(kind: unknown, id: unknown): Promise<{ ok: true; png: string } | { ok: false; error: string }> {
  const target: ShareTarget | null = kind === 'shop' ? { kind: 'shop' }
    : (kind === 'product' || kind === 'collection') && typeof id === 'string' && UUID.test(id) ? { kind, id } : null
  if (!target) return { ok: false, error: 'Nothing to share.' }
  try {
    // Through asMember (check:actions): a support visit making a QR code is audited like any console action.
    const r = await asMember(ANY_MEMBER, { action: 'share.qr', target: target.kind }, async (_tx, auth) => {
      const s = await shareFor(auth.membership.tenantId, target)
      return s?.ready ? s.links.share_qr : null
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (!r.value) return { ok: false, error: 'Not shareable yet.' }
    // Drawn after the transaction closes: no connection is held while the PNG is made.
    return { ok: true, png: await QRCode.toDataURL(r.value, { errorCorrectionLevel: 'M', margin: 2, width: 512 }) }
  } catch (err) {
    console.error('[shareQr]', err instanceof Error ? err.name : 'error')
    return { ok: false, error: 'We could not make the QR code. Try again.' }
  }
}
