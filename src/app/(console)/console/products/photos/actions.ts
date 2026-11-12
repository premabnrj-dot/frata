'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { MAX_PHOTOS_PER_PRODUCT } from '@/domains/catalogue/import/photos'
import { WIDTHS } from '@/domains/media/sizes'
import { asMember } from '@/lib/auth/as-member'
import { memberAudit } from '@/lib/auth/member-audit'
import { ANY_MEMBER } from '@/lib/auth/require-member'
import { attachIn } from '@/lib/catalogue/photos'
import { errName } from '@/lib/log'
import { photosAreMade } from '@/lib/media/uploaded'
import { refreshSoldOut } from '@/lib/queries/storefront'

// =============================================================================
// Photos by file name (product import PI·2). The browser matched, resized and uploaded the photos (into this shop's
// products folder, through the import bucket); this attaches one product's batch. Who: ANY_MEMBER, as for editing a
// product. The tenant is the member's, never the call's: the product is looked up in the member's shop only, and the
// files must be in that shop's folder and start as the photo's format says (photosAreMade). Through asMember: a support
// visit is audited with the write. A live product's photos reach the shop through the debounced catalogue purge (at
// most once per 30 s, a trailing one after), so 60 products' photos never purge the catalogue 60 times.
// =============================================================================

const Photo = z.object({
  base: z.string().max(300),
  widths: z.array(z.number().int()).min(1).max(WIDTHS.length),
  width: z.number().int().positive().max(40_000),
  height: z.number().int().positive().max(40_000),
  colour: z.string().max(40).nullable(),
}).strict()
const Input = z.object({ productId: z.uuid(), photos: z.array(Photo).min(1).max(MAX_PHOTOS_PER_PRODUCT) }).strict()

export async function addPhotos(input: unknown): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  const parsed = Input.safeParse(input)
  if (!parsed.success) {
    const many = Array.isArray((input as { photos?: unknown } | null)?.photos) && (input as { photos: unknown[] }).photos.length > MAX_PHOTOS_PER_PRODUCT
    return { ok: false, error: many ? `Up to ${MAX_PHOTOS_PER_PRODUCT} photos a product.` : 'Those photos could not be read. Upload them again.' }
  }
  const { productId, photos } = parsed.data
  if (!(await photosAreMade(photos))) return { ok: false, error: 'That file is not a photo we made. Upload it again.' }
  try {
    const r = await asMember(ANY_MEMBER, { action: 'product.photos', target: productId, detail: { added: photos.length, by: 'file name' } }, async (tx, auth) => {
      const done = await attachIn(tx, auth.membership.tenantId, productId, photos, { max: MAX_PHOTOS_PER_PRODUCT })
      if (!done.ok) return done
      await memberAudit(tx, auth, 'product.photos', productId)
      return done
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (!r.value.ok) return r.value
    if (r.value.live && r.value.added) await refreshSoldOut(r.tenantId)
    revalidatePath('/console/products', 'layout')
    return { ok: true, added: r.value.added }
  } catch (err) {
    console.error('[addPhotos]', errName(err))
    return { ok: false, error: 'We could not add the photos. Try again.' }
  }
}
