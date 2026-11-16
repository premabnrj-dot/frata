// Money in Frrata Admin needs a fresh passkey (security review on the N4 plan, H2; impact review on the diff): Issue, a
// payment, a credit note and a refund each refuse with STAFF_CONFIRM_FIRST when the check is older than 5 minutes, and
// none of them reaches the money it would move. A fresh check reaches it. Sign-in and the billing lib are mocked.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STAFF_CONFIRM_FIRST } from '@/domains/tenancy/staff-words'

const lib = { issueMonth: vi.fn(), recordPayment: vi.fn(), issueCreditNote: vi.fn(), recordRefund: vi.fn(), runCollectionNow: vi.fn(), runDraftsNow: vi.fn() }
let confirmedAt = new Date(0)
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/admin/billing', () => lib)
vi.mock('@/lib/billing/run', () => ({ draftableMonths: () => [] }))
vi.mock('@/lib/auth/require-staff', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/require-staff')>()),
  requireStaff: async () => ({ ok: true, userId: 'u', email: 'm@frrata.test', role: 'admin', sessionId: 's', confirmedAt }),
}))

const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f }
const ID = '00000000-0000-4000-8000-000000000001', PAY = '00000000-0000-4000-8000-000000000002'
const CASES = [
  ['issueAction', form({ month: '2024-01', count: '1', total: '100', confirm: 'ISSUE 1' }), 'issueMonth'],
  ['paymentAction', form({ invoice: ID, rupees: '10', method: 'upi', utr: 'UTR123456' }), 'recordPayment'],
  ['creditAction', form({ invoice: ID, rupees: '10', reason: 'Goodwill' }), 'issueCreditNote'],
  ['refundAction', form({ invoice: ID, payment: PAY, utr: 'UTR123456', sentOn: '2024-01-02' }), 'recordRefund'],
] as const

describe('Admin money actions and the passkey check', () => {
  beforeEach(() => { for (const f of Object.values(lib)) f.mockReset().mockResolvedValue({ issued: 1, closed: 0, test: false }) })
  for (const [action, f, call] of CASES) {
    it(`${action}: a check older than 5 minutes is refused before any money moves`, async () => {
      confirmedAt = new Date(Date.now() - 6 * 60_000)
      const A = await import('../actions')
      expect(await A[action](f)).toEqual({ error: STAFF_CONFIRM_FIRST })
      expect(lib[call]).not.toHaveBeenCalled()
    })
    it(`${action}: a fresh check reaches it`, async () => {
      confirmedAt = new Date()
      const A = await import('../actions')
      await A[action](f)
      expect(lib[call]).toHaveBeenCalledTimes(1)
    })
  }
})
