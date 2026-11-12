import { NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { contentTypeOf, formatOfPath, maxBytesFor, PATH_SHAPE, UPLOAD_TOKEN_MS } from '@/domains/media/sizes'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { BLOB_READ_WRITE_TOKEN, isBlobConfigured } from '@/lib/env'
import { errName } from '@/lib/log'
import { importToken } from '@/lib/media/import-bucket'
import { fromConsole } from '@/lib/http/same-origin'

// Cost guardrails G·1 (scripts/check-duration.mjs): a route stops at its limit, never Vercel's 300 s.
export const maxDuration = 30

// The Photos page's upload tokens (product import PI·2): the same as /api/console/upload for a PRODUCT photo — a
// signed-in member from the console's own origin, a path inside that member's own shop's products folder only, the
// type its extension says, the size's own cap, valid 5 minutes, never overwriting — counted in the import's own
// bucket: one per photo, not per width (import-bucket.ts). Nothing else goes through here: no logo, no look photo, no
// paper logo. The row is written by addPhotos (attachIn), which checks the folder and the files' first bytes again.
export async function POST(request: Request) {
  if (!isBlobConfigured()) return NextResponse.json({ error: 'Photo storage is not connected.' }, { status: 503 })
  if (!fromConsole(request)) return NextResponse.json({ error: 'That upload was refused.' }, { status: 403 })
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: 401 })
  const body = (await request.json()) as HandleUploadBody
  try {
    const result = await handleUpload({
      body, request, token: BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname) => {
        const m = PATH_SHAPE.exec(pathname)
        if (!m || m[1] !== auth.membership.tenantId || m[2] !== 'products') throw new Error('path outside this shop’s products')
        if (!(await importToken(auth.membership.tenantId, m[3]!, Number(m[4]), new Date()))) throw new Error('import upload limit')
        return { allowedContentTypes: [contentTypeOf(formatOfPath(m[5]!))], maximumSizeInBytes: maxBytesFor(Number(m[4])), validUntil: Date.now() + UPLOAD_TOKEN_MS, addRandomSuffix: false, allowOverwrite: false, cacheControlMaxAge: 31536000 }
      },
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[upload import]', errName(err))
    return NextResponse.json({ error: 'That upload was refused.' }, { status: 400 })
  }
}
