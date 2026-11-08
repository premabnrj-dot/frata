import { NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { DOC_LOGO_SHAPE, MAX_DOC_IMAGE_BYTES, MAX_UPLOAD_BYTES, PATH_SHAPE } from '@/domains/media/sizes'
import { ANY_MEMBER, CAN_BUILD, requireMember } from '@/lib/auth/require-member'
import { sectionFor } from '@/domains/settings/sections'
import { BLOB_READ_WRITE_TOKEN, isBlobConfigured } from '@/lib/env'
import { errName } from '@/lib/log'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'

// Photo uploads (ADR-0005). The browser asks for a one-time token for ONE
// path; we give it only to a signed-in member, only for a path inside that
// member's own shop folder (tenants/<tenantId>/…), only WebP, only up to 3 MB,
// never overwriting. The database row is written by attachPhotos (our action,
// which checks the folder again) — not by an upload callback, which would be a
// third place a tenant id comes from (tenancy audit, 2026-11-06).
export async function POST(request: Request) {
  if (!isBlobConfigured()) return NextResponse.json({ error: 'Photo storage is not connected.' }, { status: 503 })
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: 401 })
  const body = (await request.json()) as HandleUploadBody
  try {
    const result = await handleUpload({
      body, request, token: BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname) => {
        // The logo for paper (Documents D2): one PNG, at most 1 MB, by whoever may edit Settings › Documents, never a
        // Frrata support visit. Its bytes are checked again when it is set (setDocLogo) and when a document loads it.
        const d = DOC_LOGO_SHAPE.exec(pathname)
        if (d) {
          if (d[1] !== auth.membership.tenantId) throw new Error('path outside this shop')
          if (!(sectionFor('documents')?.editors ?? []).includes(auth.membership.role) || auth.membership.supportSessionId) throw new Error('documents needs a documents editor')
          if (!(await withinLimit(LIMITS.uploadShop, auth.membership.tenantId, new Date(), true))) throw new Error('upload limit') // fails closed (security review 2026-11-08)
          return { allowedContentTypes: ['image/png'], maximumSizeInBytes: MAX_DOC_IMAGE_BYTES, addRandomSuffix: false, allowOverwrite: false, cacheControlMaxAge: 31536000 }
        }
        const m = PATH_SHAPE.exec(pathname)
        if (!m || m[1] !== auth.membership.tenantId) throw new Error('path outside this shop')
        // The shop's logo (brand/) is a setting: whoever may edit the Brand section (sections.ts `editors`).
        if (m[2] === 'brand' && !(sectionFor('brand')?.editors ?? []).includes(auth.membership.role)) throw new Error('brand needs a brand editor')
        // A look's photos: whoever may edit the look, never a Frrata support visit (themes plan, tenancy review).
        if (m[2] === 'theme' && (!(CAN_BUILD as readonly string[]).includes(auth.membership.role) || auth.membership.supportSessionId)) throw new Error('theme needs a look editor')
        if (!(await withinLimit(LIMITS.uploadShop, auth.membership.tenantId, new Date(), true))) throw new Error('upload limit') // fails closed (security review 2026-11-08)
        return { allowedContentTypes: ['image/webp'], maximumSizeInBytes: MAX_UPLOAD_BYTES, addRandomSuffix: false, allowOverwrite: false, cacheControlMaxAge: 31536000 }
      },
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[upload]', errName(err))
    return NextResponse.json({ error: 'That upload was refused.' }, { status: 400 })
  }
}
