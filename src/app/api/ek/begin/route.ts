import { NextResponse } from 'next/server'
import { requireEk } from '@/lib/ekcode/require-ek'
import { flowView } from '@/lib/db/ekcode'
import { tokenDigest } from '@/lib/ekcode/keys'
import { writeFlow } from '@/lib/ekcode/flow-cookie'
import { scheme } from '@/lib/ekcode/cookie-name'
import { EKCODE_HOST } from '@/lib/public-env'

// The shop's redirect lands here (top-level, ?flow=<handle> made by the shop's server): the handle goes into the sealed
// cookie and the shopper sees /continue. Nothing about the shop comes from the query but the handle.
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  const g = await requireEk(request, null)
  if (!g.ok) return g.response
  const handle = new URL(request.url).searchParams.get('flow') ?? ''
  // Built from EkCode's own host, never request.url (behind a proxy that is the server's internal address).
  const to = `${scheme()}://${EKCODE_HOST}/continue`
  if (/^[A-Za-z0-9_-]{43}$/.test(handle) && (await flowView(tokenDigest(handle)))) await writeFlow({ h: handle })
  return NextResponse.redirect(to, { status: 303, headers: { 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' } })
}
