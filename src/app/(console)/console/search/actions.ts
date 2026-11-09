'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { asMember } from '@/lib/auth/as-member'
import { CAN_BUILD } from '@/lib/auth/require-member'
import { auditEvents, shopSettings } from '@/lib/db/schema'
import { refreshShop } from '@/lib/queries/storefront'
import { errName } from '@/lib/log'

type Result = { ok: true } | { ok: false; error: string; errors?: Record<string, string> }

/** Home on Google (search and sharing S·3): the shop's own title and description; empty uses the defaults. */
export async function saveHomeSeo(input: { seoTitle: string; seoDescription: string }): Promise<Result> {
  const seoTitle = String(input?.seoTitle ?? '').trim().replace(/\s+/g, ' ')
  const seoDescription = String(input?.seoDescription ?? '').trim().replace(/\s+/g, ' ')
  const errors: Record<string, string> = {}
  if (seoTitle.length > 200) errors.seoTitle = 'Up to 200 characters.'
  if (seoDescription.length > 400) errors.seoDescription = 'Up to 400 characters.'
  if (Object.keys(errors).length) return { ok: false, error: 'Some fields need a look before saving.', errors }
  try {
    const r = await asMember(CAN_BUILD, { action: 'settings.home_seo' }, async (tx, auth) => {
      const tenantId = auth.membership.tenantId
      await tx.update(shopSettings).set({ seoTitle, seoDescription, updatedAt: new Date() }).where(eq(shopSettings.tenantId, tenantId))
      if (!auth.membership.supportSessionId) await tx.insert(auditEvents).values({ tenantId, actorUserId: auth.userId, actorEmail: auth.email, actorKind: 'member', action: 'settings.home_seo', detail: { title: seoTitle !== '', description: seoDescription !== '' } })
    })
    if (!r.ok) return { ok: false, error: r.error }
    refreshShop(r.tenantId, 'shop')
    revalidatePath('/console/search')
    return { ok: true }
  } catch (err) {
    console.error('[saveHomeSeo]', errName(err))
    return { ok: false, error: 'We could not save. Nothing was changed. Try again in a minute.' }
  }
}
