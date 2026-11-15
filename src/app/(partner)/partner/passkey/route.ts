import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePartner } from '@/lib/auth/require-partner'
import { partnerCookieName, partnerCookieOptions } from '@/lib/auth/partner-cookie'
import { PASSKEY_BODY_MAX, PasskeyResponse, passkeySite, readCapped, type Result } from '@/lib/auth/webauthn'
import {
  addOptions, addVerify, approveRequest, confirmOptions, confirmVerify, declineRequest, removeAllPasskeys, removePasskey, requestPasskey,
} from '@/lib/db/partner-passkeys'
import { cityLabel, CONFIRM_FIRST, deviceLabel } from '@/domains/partners/passkeys'

// =============================================================================
// FILE: src/app/(partner)/partner/passkey/route.ts — the browser's calls for partner people's passkeys (T1b;
// docs/specs/2026-11-15-partner-login.md). Each request: the console host and its exact origin only, 16 kB at most, Zod
// before anything is read. requirePartner decides who: a PartnerIdentity (an approved, live partner person with no check
// on this session) may only confirm, ask and add; approving, declining and deleting need a PartnerOk (approving and
// deleting a check in the last 5 minutes). The database holds every other rule (drizzle/0129). The security emails these
// queue go with the next drain (5 minutes): sending them needs frata_admin, which the workspace never holds.
// =============================================================================

// Cost guardrails G·1 (scripts/check-duration.mjs): a route stops at its limit, never Vercel's 300 s.
export const maxDuration = 15

const Body = z.object({
  op: z.enum(['confirm-options', 'confirm-verify', 'add-options', 'add-verify', 'request', 'approve', 'decline', 'remove', 'remove-all']),
  response: PasskeyResponse.optional(),
  name: z.string().trim().min(1).max(40).optional(),
  code: z.string().regex(/^[0-9 ]{6,8}$/).optional(),
  memberId: z.uuid().optional(),
  passkeyId: z.uuid().optional(),
})
const H = { 'cache-control': 'no-store' }
const no = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: H })
const send = <T>(r: Result<T>) => (r.ok ? NextResponse.json({ ok: true, value: r.value }, { headers: H }) : no(r.error, 409))

export async function POST(request: Request) {
  const site = passkeySite(request.headers.get('host') ?? '')
  if (!site || request.headers.get('origin') !== site.origin) return no('Not here', 403)
  if (Number(request.headers.get('content-length') ?? 0) > PASSKEY_BODY_MAX) return no('Too large', 413)
  const text = await readCapped(request, PASSKEY_BODY_MAX)
  if (text === null) return no('Too large', 413)
  let parsed: z.infer<typeof Body>
  try { parsed = Body.parse(JSON.parse(text)) } catch { return no('Bad request') }

  const p = await requirePartner()
  const caller = p.ok ? p : p.reason === 'needs_passkey' ? p.identity : null
  if (!caller) return no(p.ok ? '' : p.message, 403)
  const ok = p.ok ? p : null

  switch (parsed.op) {
    case 'confirm-options': return send(await confirmOptions(caller, site))
    case 'confirm-verify': {
      if (!parsed.response) return no('Bad request')
      const r = await confirmVerify(caller, parsed.response as never, site)
      if (!r.ok) return no(r.error, 409)
      ;(await cookies()).set(partnerCookieName(), r.value, partnerCookieOptions())
      return NextResponse.json({ ok: true }, { headers: H })
    }
    case 'add-options': return send(await addOptions(caller, site))
    case 'add-verify': {
      if (!parsed.response || !parsed.name) return no('Bad request')
      return send(await addVerify(caller, parsed.response as never, parsed.name, site))
    }
    case 'request':
      return send(await requestPasskey(caller, deviceLabel(request.headers.get('user-agent')), cityLabel(request.headers.get('x-vercel-ip-city'))))
    case 'approve':
      if (!ok) return no(CONFIRM_FIRST, 403)
      if (!parsed.memberId || !parsed.code) return no('Bad request')
      return send(await approveRequest(ok, parsed.memberId, parsed.code))
    case 'decline':
      if (!ok) return no(CONFIRM_FIRST, 403)
      if (!parsed.memberId) return no('Bad request')
      return send(await declineRequest(ok, parsed.memberId))
    case 'remove':
      if (!ok) return no(CONFIRM_FIRST, 403)
      if (!parsed.passkeyId) return no('Bad request')
      return send(await removePasskey(ok, parsed.passkeyId))
    case 'remove-all':
      if (!ok) return no(CONFIRM_FIRST, 403)
      if (!parsed.memberId) return no('Bad request')
      return send(await removeAllPasskeys(ok, parsed.memberId))
  }
}
