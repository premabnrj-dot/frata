// Razorpay keys on a real Postgres (tenant A of the proof; skipped unless INT_DB_HOST is set, as in CI). Shop stress test
// 2026-11-11: live keys saved after test keys inherited "the webhook worked" from the TEST webhook, so the shop offered
// online payment with no live webhook and hid the secret the merchant needed to make one. Rolled back.
import { describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const A = '11111111-1111-1111-1111-111111111111'

describe.skipIf(!host)('saving Razorpay keys', () => {
  it('a reconnect in the same mode keeps the webhook; a change of mode forgets that it worked and shows the secret', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.PAYMENT_KEYS_SECRET ??= 'int-test-only'
    const { withTenant } = await import('@/lib/db/tenant')
    const { saveKeys, markEvent, paymentStatus, keysFor, canTakeOnline } = await import('@/lib/payments/keys')
    const ROLLBACK = new Error('rollback')
    await withTenant(A, async (tx) => {
      await saveKeys(tx, A, { keyId: 'rzp_test_AAAAAAAAAAAAAA', keySecret: 'test-secret-1' })
      await markEvent(tx, A)
      const t = await paymentStatus(tx, A)
      expect(t).toMatchObject({ connected: true, mode: 'test', webhookSecret: null })
      // Same mode again: the webhook stays known to work.
      await saveKeys(tx, A, { keyId: 'rzp_test_BBBBBBBBBBBBBB', keySecret: 'test-secret-2' })
      expect((await paymentStatus(tx, A) as { webhookSeenAt: Date | null }).webhookSeenAt).not.toBeNull()
      const testKey = (t as { webhookKey: string }).webhookKey
      // Live keys: not "working" until a live event arrives, and the secret shows again.
      const switchedAt = new Date()
      await saveKeys(tx, A, { keyId: 'rzp_live_CCCCCCCCCCCCCC', keySecret: 'live-secret' })
      const l = await paymentStatus(tx, A)
      expect(l).toMatchObject({ connected: true, mode: 'live', webhookSeenAt: null, lastEventAt: null })
      expect((l as { webhookSecret: string | null }).webhookSecret).toMatch(/^whsec_/)
      // A new URL: the test webhook, still calling its old one, can't reach the live keys (impact review 2026-11-11).
      expect((l as { webhookKey: string }).webhookKey).not.toBe(testKey)
      expect(canTakeOnline(await keysFor(tx, A))).toBe(false)
      // An event stored before the switch (a test one, processed later) proves nothing about live.
      await markEvent(tx, A, new Date(switchedAt.getTime() - 60_000))
      expect(canTakeOnline(await keysFor(tx, A))).toBe(false)
      await markEvent(tx, A)
      expect(canTakeOnline(await keysFor(tx, A))).toBe(true)
      // Razorpay refused the keys (2026-11-12): Settings shows it; a mark for keys replaced meanwhile changes nothing;
      // reconnecting clears it.
      const { markProblem, KEYS_REFUSED } = await import('@/lib/payments/keys')
      await markProblem(tx, A, KEYS_REFUSED, 'rzp_test_AAAAAAAAAAAAAA')
      expect((await paymentStatus(tx, A) as { problem: string | null }).problem).toBeNull()
      await markProblem(tx, A, KEYS_REFUSED, 'rzp_live_CCCCCCCCCCCCCC')
      expect((await paymentStatus(tx, A) as { problem: string | null }).problem).toBe(KEYS_REFUSED)
      expect((await keysFor(tx, A))?.problem).toBe(KEYS_REFUSED)
      await saveKeys(tx, A, { keyId: 'rzp_live_CCCCCCCCCCCCCC', keySecret: 'live-secret' })
      expect((await paymentStatus(tx, A) as { problem: string | null }).problem).toBeNull()
      throw ROLLBACK
    }).catch((e) => { if (e !== ROLLBACK) throw e })
  })
})
