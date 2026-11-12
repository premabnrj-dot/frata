import { cookies } from 'next/headers'
import { after, NextResponse } from 'next/server'
import { sendStaffNotices } from '@/lib/email/staff-notices'
import { z } from 'zod'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { staffProof } from '@/lib/auth/session'
import { passkeySite, staffCookieName, staffCookieSecure } from '@/lib/auth/staff-cookie'
import {
  addOptions, addVerify, approveRequest, confirmOptions, confirmVerify, removePasskey, requestPasskey, type Result,
} from '@/lib/admin/passkeys'

// =============================================================================
// FILE: src/app/(admin)/admin/passkey/route.ts — the browser's calls for staff passkeys
// (docs/specs/2026-11-12-staff-passkeys.md). Each request: the console host and its exact origin only (this path would
// otherwise answer on every shop domain), 16 kB at most, Zod before anything is read. requireStaff decides who: a
// StaffIdentity (signed in, on staff, no check yet) may only confirm, ask and add; approving and removing need a
// StaffOk checked within 5 minutes. The database holds every other rule (drizzle/0105).
// =============================================================================

// Cost guardrails G·1 (scripts/check-duration.mjs): a route stops at its limit, never Vercel's 300 s.
export const maxDuration = 15

const Body = z.object({
  op: z.enum(['confirm-options', 'confirm-verify', 'add-options', 'add-verify', 'request', 'approve', 'remove']),
  // The browser's WebAuthn answer: only the fields the server reads, each capped (security review L1).
  response: z.object({
    id: z.string().regex(/^[A-Za-z0-9_-]{16,1400}$/), rawId: z.string().regex(/^[A-Za-z0-9_-]{16,1400}$/), type: z.literal('public-key'),
    authenticatorAttachment: z.string().max(40).optional(), clientExtensionResults: z.record(z.string(), z.unknown()).optional(),
    response: z.object({
      clientDataJSON: z.string().regex(/^[A-Za-z0-9_-]{1,4000}$/),
      authenticatorData: z.string().regex(/^[A-Za-z0-9_-]{1,8000}$/).optional(), signature: z.string().regex(/^[A-Za-z0-9_-]{1,2000}$/).optional(),
      userHandle: z.string().regex(/^[A-Za-z0-9_-]{0,400}$/).optional(), attestationObject: z.string().regex(/^[A-Za-z0-9_-]{1,10000}$/).optional(),
      transports: z.array(z.string().max(20)).max(8).optional(), publicKeyAlgorithm: z.number().int().optional(),
      publicKey: z.string().max(2000).optional(), authenticatorDataPresent: z.boolean().optional(),
    }),
  }).optional(),
  name: z.string().trim().min(1).max(40).optional(),
  email: z.string().trim().toLowerCase().email().max(200).optional(),
  code: z.string().regex(/^[0-9 ]{6,8}$/).optional(),
  passkeyId: z.string().uuid().optional(),
})
const MAX = 16 * 1024
async function readCapped(request: Request, max: number): Promise<string | null> {
  const reader = request.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) { await reader.cancel().catch(() => {}); return null }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}
const no = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: { 'cache-control': 'no-store' } })
const send = <T>(r: Result<T>) => (r.ok ? NextResponse.json({ ok: true, value: r.value }, { headers: { 'cache-control': 'no-store' } }) : no(r.error, 409))

export async function POST(request: Request) {
  const site = passkeySite(request.headers.get('host') ?? '')
  if (!site || request.headers.get('origin') !== site.origin) return no('Not here', 403)
  if (Number(request.headers.get('content-length') ?? 0) > MAX) return no('Too large', 413)
  // Read at most MAX bytes even without a content-length (security review L4): the rest is never buffered.
  const text = await readCapped(request, MAX)
  if (text === null) return no('Too large', 413)
  let parsed: z.infer<typeof Body>
  try { parsed = Body.parse(JSON.parse(text)) } catch { return no('Bad request') }

  const staff = await requireStaff(ANY_STAFF)
  const identity = staff.ok ? staff : staff.reason === 'needs_passkey' ? staff.identity : null
  if (!identity) return no(staff.ok ? '' : staff.message, 403)
  const proof = staff.ok ? await staffProof(staff.userId) : null

  // A change that queued security emails (approve, add, remove) sends them after the response, not at the next drain.
  if (parsed.op === 'approve' || parsed.op === 'add-verify' || parsed.op === 'remove') after(() => sendStaffNotices().then(() => undefined, () => undefined))
  switch (parsed.op) {
    case 'confirm-options': return send(await confirmOptions(identity, site))
    case 'confirm-verify': {
      if (!parsed.response) return no('Bad request')
      const r = await confirmVerify(identity, parsed.response as never, site)
      if (!r.ok) return no(r.error, 409)
      ;(await cookies()).set(staffCookieName(), r.value, { httpOnly: true, secure: staffCookieSecure(), sameSite: 'strict', path: '/', maxAge: 12 * 3600 })
      return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } })
    }
    case 'add-options': return send(await addOptions(identity, proof, site))
    case 'add-verify': {
      if (!parsed.response || !parsed.name) return no('Bad request')
      return send(await addVerify(identity, proof, parsed.response as never, parsed.name, site))
    }
    case 'request': return send(await requestPasskey(identity))
    case 'approve': {
      if (!staff.ok || !proof || !parsed.email || !parsed.code) return no(staff.ok ? 'Bad request' : 'Confirm it\'s you first', staff.ok ? 400 : 403)
      return send(await approveRequest(staff, proof, parsed.email, parsed.code))
    }
    case 'remove': {
      if (!staff.ok || !proof || !parsed.passkeyId) return no(staff.ok ? 'Bad request' : 'Confirm it\'s you first', staff.ok ? 400 : 403)
      return send(await removePasskey(staff, proof, parsed.passkeyId))
    }
  }
}
