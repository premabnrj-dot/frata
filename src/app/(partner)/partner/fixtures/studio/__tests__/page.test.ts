// The test-only Studio workbench page must be a 404 unless the e2e stack turns it on — checked before anything else
// runs (no partner lookup, no render) — and with it on, still a 404 for anyone but a live partner who passed their
// check. Production never sets E2E_FIXTURES (.env.example).
import { beforeEach, describe, expect, it, vi } from 'vitest'

const notFound = vi.fn(() => { throw new Error('NEXT_NOT_FOUND') })
const requirePartner = vi.fn(async () => ({ ok: true }))
const env = { E2E_FIXTURES: false }
vi.mock('next/navigation', () => ({ notFound }))
vi.mock('@/lib/auth/require-partner', () => ({ requirePartner }))
vi.mock('@/lib/env', () => env)
vi.mock('../_workbench/workbench', () => ({ Workbench: () => null }))

describe('the Studio fixtures page', () => {
  beforeEach(() => { notFound.mockClear(); requirePartner.mockClear(); vi.resetModules() })
  it('is a 404 with the switch off, before any partner lookup', async () => {
    env.E2E_FIXTURES = false
    const page = (await import('../page')).default
    await expect(page({})).rejects.toThrow('NEXT_NOT_FOUND')
    expect(requirePartner).not.toHaveBeenCalled()
  })
  it('with the switch on, still needs a partner', async () => {
    env.E2E_FIXTURES = true
    requirePartner.mockResolvedValueOnce({ ok: false, reason: 'needs_passkey' } as never)
    const page = (await import('../page')).default
    await expect(page({})).rejects.toThrow('NEXT_NOT_FOUND')
    expect(requirePartner).toHaveBeenCalledOnce()
  })
  it('reads the shell\'s states from the address, each only as 1', async () => {
    env.E2E_FIXTURES = true
    const page = (await import('../page')).default
    const el = await page({ searchParams: Promise.resolve({ builder: '1', nologo: '1', waiting: 'yes' }) }) as { props: { flags: unknown } }
    expect(el.props.flags).toEqual({ builder: true, noLogo: true, waiting: false })
    const none = await page({ searchParams: Promise.resolve({}) }) as { props: { flags: unknown } }
    expect(none.props.flags).toEqual({ builder: false, noLogo: false, waiting: false })
  })
  it('renders for a partner with the switch on', async () => {
    env.E2E_FIXTURES = true
    const page = (await import('../page')).default
    await expect(page({})).resolves.toBeTruthy()
  })
})
