// photosAreMade (security review PI·2): every size named must be read and start as its photo's format says — a file
// that is missing (404), answers 5xx, or never answers refuses the photo; a WebP base wants RIFF…WEBP, a .jpg base FF D8 FF.
// The sign-in and Blob's answers are stood in.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const T = 'aaaaaaaa-1111-4111-8111-111111111111', ID = 'cccccccc-3333-4333-8333-333333333333', STORE = 'https://teststore.public.blob.vercel-storage.com'
const answers = vi.hoisted(() => ({ byUrl: new Map<string, Response | 'timeout'>(), asked: [] as string[] }))
vi.mock('@/lib/auth/require-member', async () => ({
  ...(await import('@/domains/tenancy/roles')),
  requireMember: async () => ({ ok: true, userId: 'u', email: 'e', staffRole: null, all: [], membership: { tenantId: 'aaaaaaaa-1111-4111-8111-111111111111', tenantName: 'A', role: 'staff', supportSessionId: null } }),
}))
vi.mock('@/lib/env', () => ({ BLOB_STORE_ID: 'store_teststore' }))
vi.mock('@/lib/http/timeout', () => ({
  fetchWithTimeout: async (url: string) => {
    answers.asked.push(url)
    const a = answers.byUrl.get(url)
    if (!a || a === 'timeout') throw new Error('timeout')
    return a.clone()
  },
}))
const { photosAreMade } = await import('../uploaded')

const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])
const base = `${STORE}/tenants/${T}/products/${ID}`
const set = (w: number, r: Response | 'timeout', b = base) => answers.byUrl.set(b.endsWith('.jpg') ? `${b.slice(0, -4)}-${w}.jpg` : `${b}-${w}.webp`, r)

beforeEach(() => { answers.byUrl.clear(); answers.asked = [] })

describe('photosAreMade', () => {
  it('every size read and of its format: made', async () => {
    set(400, new Response(WEBP, { status: 206 })); set(800, new Response(WEBP, { status: 200 }))
    expect(await photosAreMade([{ base, widths: [400, 800] }])).toBe(true)
    expect(answers.asked).toHaveLength(2)
    set(400, new Response(JPEG, { status: 206 }), `${base}.jpg`)
    expect(await photosAreMade([{ base: `${base}.jpg`, widths: [400] }])).toBe(true)
  })
  it('a missing size, a 5xx, no answer or the wrong first bytes: not made', async () => {
    set(400, new Response(WEBP, { status: 206 }))
    expect(await photosAreMade([{ base, widths: [400, 800] }])).toBe(false) // 800 never answers
    set(800, new Response('no', { status: 404 }))
    expect(await photosAreMade([{ base, widths: [400, 800] }])).toBe(false)
    set(800, new Response('no', { status: 503 }))
    expect(await photosAreMade([{ base, widths: [400, 800] }])).toBe(false)
    set(800, new Response(JPEG, { status: 206 }))
    expect(await photosAreMade([{ base, widths: [400, 800] }])).toBe(false) // a JPEG behind a WebP base
    set(800, 'timeout')
    expect(await photosAreMade([{ base, widths: [400, 800] }])).toBe(false)
  })
})
