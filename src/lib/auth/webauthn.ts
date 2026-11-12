import 'server-only'
import { createHash } from 'node:crypto'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { E2E_FIXTURES, VERCEL_ENV } from '@/lib/env'
import { CONSOLE_HOST } from '@/lib/public-env'
import { errName } from '@/lib/log'

// =============================================================================
// FILE: src/lib/auth/webauthn.ts — THE PASSKEY CEREMONY, once, for staff (docs/specs/2026-11-12-staff-passkeys.md) and
// partner people (docs/plans/2026-11-12-studio-build.md § T1b). Frrata checks the passkey itself with SimpleWebAuthn;
// each side's database definers hold the rules (who, which session, which purpose, once, how long) behind a
// PasskeyStore of five calls. The risky steps live here only: user verification required, the exact origin and site,
// the challenge taken (once) before the signature is verified, the counter, transports as a text[] parameter.
// =============================================================================

// ── The passkey's site ────────────────────────────────────────────────────────
const insecure = () => VERCEL_ENV === '' && (E2E_FIXTURES || process.env.NODE_ENV === 'development')
/** Plain-http localhost on the local e2e stack (a secure context to WebAuthn; Chromium drops a Secure cookie there). */
export const passkeyCookieSecure = () => !insecure()
/** `__Host-<name>` everywhere but the local e2e stack. */
export const passkeyCookieName = (name: string) => (insecure() ? name : `__Host-${name}`)

export type PasskeySite = { rpID: string; origin: string }
/** The passkey's site for a request to `requestHost`: only the console host (compared without a port), its
 *  relying-party id that host name, its expected origin that scheme and host exactly. Null anywhere else. */
export const passkeySite = (requestHost: string): PasskeySite | null => {
  const rpID = CONSOLE_HOST.toLowerCase().replace(/:\d+$/, '')
  const host = requestHost.toLowerCase()
  if (!rpID || host.replace(/:\d+$/, '') !== rpID || !/^[a-z0-9.-]+(:\d{1,5})?$/.test(host)) return null
  return { rpID, origin: `${insecure() ? 'http' : 'https'}://${host}` }
}

// ── Small shared rules ────────────────────────────────────────────────────────
/** The challenge the browser signed, read from its clientDataJSON (the definer then checks it is this person's). */
export const challengeOf = (clientDataJSON: string): string | null => {
  try {
    const c = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf8')) as { challenge?: unknown }
    return typeof c.challenge === 'string' && /^[A-Za-z0-9_-]{40,100}$/.test(c.challenge) ? c.challenge : null
  } catch { return null }
}
/** A 6-digit request code, as stored: never the code itself; each side its own prefix (`staff-enrol`, `partner-enrol`). */
export const enrolCodeHash = (prefix: string, code: string) => createHash('sha256').update(`${prefix}:${code.replace(/\D/g, '')}`).digest('hex')
/** A Postgres text[] literal of short lowercase tokens (WebAuthn transports), passed as ONE parameter. */
export const transportsLiteral = (ts: readonly string[] | undefined) => `{${(ts ?? []).filter((t) => /^[a-z-]{1,20}$/.test(t)).slice(0, 8).join(',')}}`

// ── The route's body and its reader (both passkey routes) ────────────────────
/** The browser's WebAuthn answer: only the fields the server reads, each capped (security review L1). */
export const PasskeyResponse = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{16,1400}$/), rawId: z.string().regex(/^[A-Za-z0-9_-]{16,1400}$/), type: z.literal('public-key'),
  authenticatorAttachment: z.string().max(40).optional(), clientExtensionResults: z.record(z.string(), z.unknown()).optional(),
  response: z.object({
    clientDataJSON: z.string().regex(/^[A-Za-z0-9_-]{1,4000}$/),
    authenticatorData: z.string().regex(/^[A-Za-z0-9_-]{1,8000}$/).optional(), signature: z.string().regex(/^[A-Za-z0-9_-]{1,2000}$/).optional(),
    userHandle: z.string().regex(/^[A-Za-z0-9_-]{0,400}$/).optional(), attestationObject: z.string().regex(/^[A-Za-z0-9_-]{1,10000}$/).optional(),
    transports: z.array(z.string().max(20)).max(8).optional(), publicKeyAlgorithm: z.number().int().optional(),
    publicKey: z.string().max(2000).optional(), authenticatorDataPresent: z.boolean().optional(),
  }),
})
export const PASSKEY_BODY_MAX = 16 * 1024
/** Reads at most `max` bytes even without a content-length (security review L4): the rest is never buffered. */
export async function readCapped(request: Request, max = PASSKEY_BODY_MAX): Promise<string | null> {
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

// ── The ceremony ──────────────────────────────────────────────────────────────
export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string }
export type Who = { userId: string; sessionId: string }
export type StoredKey = { passkeyId: string; publicKey: string; counter: number; transports: string[] }

/** One side's definers. Each re-checks the caller itself; a refusal raises a P0001 whose message is a code. */
export interface PasskeyStore {
  /** This person's own credential ids and transports, so the browser offers only theirs. */
  credentials(w: Who): Promise<{ id: string; transports: string[] }[]>
  challenge(w: Who, purpose: 'confirm' | 'add', stepupHash: string | null, challenge: string): Promise<void>
  /** Marks the challenge used (once); for 'confirm', returns THIS person's key for that credential, else null. */
  take(w: Who, purpose: 'confirm' | 'add', challenge: string, credentialId: string): Promise<StoredKey | { ok: true } | null>
  confirm(w: Who, challenge: string, passkeyId: string, counter: number, tokenHash: string): Promise<void>
  add(w: Who, stepupHash: string | null, credentialId: string, publicKey: string, counter: number, transports: string, name: string): Promise<string>
}

const refused = (code: string) => Object.assign(new Error(code), { cause: { message: code } })
export const dbCodeOf = (err: unknown): string => (err as { cause?: { message?: string } })?.cause?.message ?? ''

export function passkeyCeremony(o: { rpName: string; tag: string; says: Record<string, string>; tokenHash: (token: string) => string; store: PasskeyStore }) {
  const { store, says } = o
  async function run<T>(what: string, fn: () => Promise<T>): Promise<Result<T>> {
    try { return { ok: true, value: await fn() } } catch (err) {
      const code = dbCodeOf(err)
      if (!says[code]) console.error(`[${o.tag}]`, what, errName(err))
      return { ok: false, error: says[code] ?? 'Something went wrong. Try again.' }
    }
  }
  return {
    run,
    /** Options for "Use passkey", naming this person's own passkeys (staff fix 0111: a passkey left on the device by an
     *  earlier, unrecorded try must not be the one the browser offers). The definer still accepts only this person's. */
    confirmOptions: (w: Who, site: PasskeySite) => run('confirm options', async () => {
      const mine = await store.credentials(w)
      const options = await generateAuthenticationOptions({ rpID: site.rpID, userVerification: 'required', timeout: 120_000,
        allowCredentials: mine.map((c) => ({ id: c.id, transports: c.transports as never })) })
      await store.challenge(w, 'confirm', null, options.challenge)
      return options as unknown
    }),
    /** Checks the browser's answer and makes the step-up. Returns the cookie's token (the database keeps its hash). */
    confirmVerify: async (w: Who, response: AuthenticationResponseJSON, site: PasskeySite): Promise<Result<string>> => {
      const challenge = challengeOf(response.response.clientDataJSON)
      if (!challenge) return { ok: false, error: says.replay ?? 'Not confirmed. Try again.' }
      return run('confirm verify', async () => {
        const key = await store.take(w, 'confirm', challenge, response.id)
        if (!key || !('passkeyId' in key)) throw refused('replay')
        const v = await verifyAuthenticationResponse({
          response, expectedChallenge: challenge, expectedOrigin: site.origin, expectedRPID: site.rpID, requireUserVerification: true,
          credential: { id: response.id, publicKey: Buffer.from(key.publicKey, 'base64url'), counter: Number(key.counter), transports: key.transports as never },
        })
        if (!v.verified) throw refused('replay')
        const token = randomBytes(32).toString('base64url')
        await store.confirm(w, challenge, key.passkeyId, v.authenticationInfo.newCounter, o.tokenHash(token))
        return token
      })
    },
    /** Options for "Add passkey": the definer allows it with a live check on this session (a second device) or this
     *  session's approved request. `userHandle` names the person to the device (never shared across kinds). */
    addOptions: (w: Who, userName: string, userHandle: Uint8Array, stepupHash: string | null, site: PasskeySite) => run('add options', async () => {
      const options = await generateRegistrationOptions({
        rpName: o.rpName, rpID: site.rpID, userName, userID: userHandle as Uint8Array<ArrayBuffer>, attestationType: 'none', timeout: 120_000,
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      })
      await store.challenge(w, 'add', stepupHash, options.challenge)
      return options as unknown
    }),
    addVerify: async (w: Who, stepupHash: string | null, response: RegistrationResponseJSON, name: string, site: PasskeySite): Promise<Result<string>> => {
      const challenge = challengeOf(response.response.clientDataJSON)
      if (!challenge) return { ok: false, error: says.no_challenge ?? 'That took too long. Try again.' }
      return run('add verify', async () => {
        const taken = await store.take(w, 'add', challenge, '')
        if (!taken) throw refused('no_challenge')
        const v = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: site.origin, expectedRPID: site.rpID, requireUserVerification: true })
        if (!v.verified || !v.registrationInfo) throw refused('no_challenge')
        const c = v.registrationInfo.credential
        return store.add(w, stepupHash, c.id, Buffer.from(c.publicKey).toString('base64url'), c.counter, transportsLiteral(c.transports), name)
      })
    },
  }
}
