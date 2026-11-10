import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/db/ekcode', () => ({ storeEvent: vi.fn() }))
import { ekcodeStatuses } from '../webhook'

const body = (pnid: string, statuses: unknown[]) => ({ entry: [{ changes: [{ value: { metadata: { phone_number_id: pnid }, statuses } }] }] })

describe('ekcodeStatuses', () => {
  it("keeps EkCode's own number's statuses, trimmed, with a stable key", () => {
    const got = ekcodeStatuses(body('111', [{ id: 'wamid.A', status: 'delivered', timestamp: '1794250000', recipient_id: '919845012345', conversation: {} }]), '111')
    expect(got).toHaveLength(1)
    expect(Object.keys(got[0]!).sort()).toEqual(['at', 'error', 'key', 'status', 'wamid'])
    expect(got[0]!.key).toMatch(/^[0-9a-f]{64}$/)
    expect(ekcodeStatuses(body('111', [{ id: 'wamid.A', status: 'delivered', timestamp: '1794250000' }]), '111')[0]!.key).toBe(got[0]!.key)
  })
  it('drops another number, an unknown status, junk; keeps a failure code', () => {
    expect(ekcodeStatuses(body('222', [{ id: 'w', status: 'delivered', timestamp: '1' }]), '111')).toEqual([])
    expect(ekcodeStatuses(body('111', [{ id: 'w', status: 'deleted', timestamp: '1' }]), '111')).toEqual([])
    expect(ekcodeStatuses({ nope: true }, '111')).toEqual([])
    expect(ekcodeStatuses(body('111', [{ id: 'w', status: 'failed', timestamp: '1', errors: [{ code: 131026 }] }]), '111')[0]!.error).toBe(131026)
    expect(ekcodeStatuses(body('111', [{ id: 'w', status: 'sent', timestamp: '1' }]), '')).toEqual([])
  })
})
