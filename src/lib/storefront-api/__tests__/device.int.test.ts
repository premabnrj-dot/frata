// G·3 on a real Postgres (four screens § 2): a developer's device sign-in from start to the build key. Pending until
// confirmed; the store's own owner checks nothing (a Partner owner or an assigned Lead does); the dialog's network and
// room; Give key with a passkey signed for THIS code (a real P-256 assertion, verified by the shared ceremony); the key
// minted once as the person, named by their email; a store at its ceiling answers "full" at the poll; Your computers
// lists and deletes it. Skipped unless INT_DB_HOST is set (the tenancy proof database: npm run verify:tenancy first).
import { describe, expect, it } from 'vitest'
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const b64u = (b: Buffer | Uint8Array | string) => Buffer.from(b).toString('base64url')
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest()

/** A passkey for the test: its COSE public key (as stored) and a signer for an assertion over a challenge. */
function testPasskey(rpID: string, origin: string) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string }
  // COSE_Key (RFC 8152) as CBOR: {1: 2 (EC2), 3: -7 (ES256), -1: 1 (P-256), -2: x, -3: y}
  const cose = Buffer.concat([Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]), Buffer.from(jwk.x, 'base64url'), Buffer.from([0x22, 0x58, 0x20]), Buffer.from(jwk.y, 'base64url')])
  const credentialId = b64u(randomUUID())
  let counter = 0
  return {
    credentialId, publicKey: b64u(cose),
    assert(challenge: string) {
      counter++
      const authData = Buffer.concat([sha(rpID), Buffer.from([0x05]), Buffer.from([0, 0, 0, counter])]) // UP | UV
      const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin, crossOrigin: false }))
      const signature = sign('sha256', Buffer.concat([authData, sha(clientData)]), privateKey)
      return { id: credentialId, rawId: credentialId, type: 'public-key' as const, clientExtensionResults: {}, authenticatorAttachment: 'platform' as const,
        response: { clientDataJSON: b64u(clientData), authenticatorData: b64u(authData), signature: b64u(signature) } }
    },
  }
}

describe.skipIf(!host)('the device sign-in', () => {
  it('starts, is checked and given a key by the Partner owner with a passkey for this code, and gives the key once', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const { startDeviceSignIn, checkDeviceCode, giveOptions, giveVerify, pollDeviceSignIn } = await import('../device')
    const { myComputers, deleteMyComputer } = await import('@/lib/db/device-codes')
    const { storefrontKeyRow } = await import('@/lib/db/platform')
    const postgres = (await import('postgres')).default
    const su = postgres(process.env.ADMIN_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} })
    const tag = String(Date.now() % 1_000_000)
    const t = randomUUID(), storeOwner = randomUUID(), po = randomUUID(), partner = randomUUID(), pm = randomUUID(), session = randomUUID()
    const slug = `dev${tag}`, email = `asha${tag}@studio.test`
    const ip = `198.51.100.${Date.now() % 250}`, otherIp = '203.0.113.9'
    const site = { rpID: 'localhost', origin: 'http://localhost:3000' }
    const key = testPasskey(site.rpID, site.origin)
    const me = { userId: po, sessionId: session, stepup: `stepup-${tag}` }
    try {
      await su`insert into tenants (id, slug, name) values (${t}, ${slug}, 'Dev')`
      await su`insert into shop_settings (tenant_id, pickup_pincode) values (${t}, '452009')`
      await su`insert into auth.users (id, email, email_confirmed_at) values (${po}, ${email}, now())`
      await su`insert into partners (id, user_id, email, name, business_name, phone, city, brands_now, terms_version, agreed_at, approved_at)
        values (${partner}, ${po}, ${email}, 'Asha', 'Dev Studio', '919876500001', 'Indore', '0', 1, now(), now())`
      await su`insert into partner_members (id, partner_id, user_id, email, role, accepted_at) values (${pm}, ${partner}, ${po}, ${email}, 'owner', now())`
      await su`insert into partner_links (tenant_id, partner_id, share_bps, share_months, notice_days) values (${t}, ${partner}, 2000, 24, 90)`
      await su`insert into members (tenant_id, user_id, role) values (${t}, ${storeOwner}, 'owner')`
      await su`insert into members (tenant_id, user_id, role, partner_member_id) values (${t}, ${po}, 'partner', ${pm})`
      const [pk] = await su`insert into partner_passkeys (partner_member_id, user_id, credential_id, public_key, name) values (${pm}, ${po}, ${key.credentialId}, ${key.publicKey}, 'Laptop') returning id`
      await su`insert into partner_stepups (partner_member_id, user_id, session_id, passkey_id, token_hash, expires_at) values (${pm}, ${po}, ${session}, ${pk!.id}, ${me.stepup}, now() + interval '1 hour')`

      const s = await startDeviceSignIn(slug, ip)
      expect(s).not.toBeNull()
      if (!s) return
      expect(s.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
      expect(s.verify).toMatch(/\/partner\/developer$/)
      expect(s.message).toBe(`Open ${s.verify.replace('https://', '')}\nCode ${s.code} ends in 10 minutes`)
      expect(await pollDeviceSignIn(s.device, ip)).toEqual({ status: 'pending' })

      // Check code: the store's own owner has no partner check (sign in again); a typo is its own answer; the Partner
      // owner sees the store, the same network, room and their passkey; from elsewhere, another network.
      expect(await checkDeviceCode({ userId: storeOwner, sessionId: session, stepup: me.stepup }, s.code, ip)).toEqual({ ok: false, why: 'sign_in_again' })
      expect(await checkDeviceCode(me, 'HXKT', ip)).toEqual({ ok: false, why: 'bad_code' })
      expect(await checkDeviceCode(me, 'BCDF-GHJK', ip)).toEqual({ ok: false, why: 'ended' })
      const look = await checkDeviceCode(me, s.code.toLowerCase().replace('-', ' '), ip)
      expect(look).toMatchObject({ ok: true, look: { store: 'Dev', sameNetwork: true, full: false, hasPasskey: true } })
      expect(await checkDeviceCode(me, s.code, otherIp)).toMatchObject({ ok: true, look: { sameNetwork: false } })

      // Give key: the device signs this code's challenge; a signature over another challenge is refused.
      // From another network without "This is my computer" ticked: no challenge (owner, 2026-11-22); ticked, one.
      expect(await giveOptions(me, s.code, site, otherIp, false)).toEqual({ ok: false, why: 'not_mine' })
      expect((await giveOptions(me, s.code, site, otherIp, true)).ok).toBe(true)
      const o1 = await giveOptions(me, s.code, site, ip, false)
      expect(o1.ok).toBe(true)
      if (!o1.ok) return
      expect(await giveVerify(me, s.code, key.assert(b64u('not the challenge')) as never, site)).toEqual({ ok: false, why: 'not_confirmed' })
      const o2 = await giveOptions(me, s.code, site, ip, false)
      if (!o2.ok) return
      expect(await giveVerify(me, s.code, key.assert((o2.options as { challenge: string }).challenge) as never, site)).toEqual({ ok: true, store: 'Dev' })
      expect(await checkDeviceCode(me, s.code, ip)).toEqual({ ok: false, why: 'ended' }) // used

      const got = await pollDeviceSignIn(s.device, ip)
      expect(got?.status).toBe('ok')
      if (got?.status !== 'ok') return
      const hash = createHash('sha256').update(got.key).digest('hex')
      const [row] = await su`select id, kind, purpose, name, created_by, partner_id from storefront_keys where hash = ${hash}`
      expect(row).toMatchObject({ kind: 'build', purpose: 'developer', name: `${email}’s computer`, created_by: po, partner_id: partner })
      expect((await storefrontKeyRow(hash))?.tenantId).toBe(t)
      expect(await pollDeviceSignIn(s.device, ip)).toBeNull() // once
      const [audit] = await su`select count(*)::int n from audit_events where tenant_id = ${t} and action = 'build_key.device_confirmed' and actor_user_id = ${po}`
      expect(audit!.n).toBe(1)

      // Your computers: listed, then deleted at once.
      expect((await myComputers(me)).map((c) => c.id)).toEqual([row!.id])
      expect(await deleteMyComputer(me, row!.id as string)).toBe(true)
      expect(await storefrontKeyRow(hash)).toBeNull()
      expect(await myComputers(me)).toEqual([])

      // A store that reached its ceiling after Give key: the poll says "full", and the code stays claimable while live.
      const s2 = await startDeviceSignIn(slug, ip)
      if (!s2) return
      const o3 = await giveOptions(me, s2.code, site, ip, false)
      if (!o3.ok) return
      expect(await giveVerify(me, s2.code, key.assert((o3.options as { challenge: string }).challenge) as never, site)).toEqual({ ok: true, store: 'Dev' })
      await su`insert into storefront_keys (tenant_id, kind, purpose, name, hash, prefix, created_by, expires_at)
        select ${t}, 'build', 'session', 'Filler', md5(g::text || ${slug}) || md5(${slug} || g::text), 'frs_build_aaaaaa', ${storeOwner}, now() + interval '1 hour' from generate_series(1, 50) g`
      expect(await pollDeviceSignIn(s2.device, ip)).toEqual({ status: 'full' })
      const s3 = await startDeviceSignIn(slug, ip)
      if (!s3) return
      expect(await checkDeviceCode(me, s3.code, ip)).toMatchObject({ ok: true, look: { full: true } })
    } finally {
      await su`delete from audit_events where tenant_id = ${t}`
      await su`delete from storefront_keys where tenant_id = ${t}`
      await su`delete from build_key_device_codes where store_slug = ${slug}`
      await su`delete from partner_stepups where user_id = ${po}`
      await su`delete from partner_passkeys where user_id = ${po}`
      await su`delete from members where tenant_id = ${t}`
      await su`delete from partner_links where tenant_id = ${t}`
      await su`delete from partner_members where id = ${pm}`
      await su`delete from partners where id = ${partner}`
      await su`delete from shop_settings where tenant_id = ${t}`
      await su`delete from tenants where id = ${t}`
      await su`delete from auth.users where id = ${po}`
      await su.end()
    }
  }, 60_000)
})
