// The two photo token routes (security and impact reviews of PI·2): both answer only the console's own origin; the
// import route gives tokens only for this shop's products folder (never another shop's, the look's or the logo's
// folder), counted by importToken; each token is for the size's own cap and lasts 5 minutes. The sign-in, the
// counters and the environment are stood in; the token is made by @vercel/blob from a made-up read-write token.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const TENANT = 'aaaaaaaa-1111-4111-8111-111111111111', OTHER = 'bbbbbbbb-2222-4222-8222-222222222222', PHOTO = 'cccccccc-3333-4333-8333-333333333333'
const state = vi.hoisted(() => ({ tokens: [] as [string, string, number][], allow: true }))
vi.mock('@/lib/auth/require-member', async () => ({
  ...(await import('@/domains/tenancy/roles')),
  requireMember: async () => ({ ok: true, userId: 'u', email: 'e', staffRole: null, all: [], membership: { tenantId: 'aaaaaaaa-1111-4111-8111-111111111111', tenantName: 'A', role: 'staff', supportSessionId: null } }),
}))
vi.mock('@/lib/env', () => ({ BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_teststore_secretsecret', isBlobConfigured: () => true }))
vi.mock('@/lib/public-env', () => ({ CONSOLE_HOST: 'app.frata.in', EKCODE_HOST: 'ekcode.in' }))
vi.mock('@/lib/media/import-bucket', () => ({ importToken: async (t: string, id: string, w: number) => { state.tokens.push([t, id, w]); return state.allow } }))
vi.mock('@/lib/db/rate-limit', () => ({ LIMITS: { uploadShop: {} }, withinLimit: async () => true }))

const { POST: importPost } = await import('../import/route')
const { POST: editorPost } = await import('../route')

const ask = (pathname: string, headers: Record<string, string> = { origin: 'https://app.frata.in', host: 'app.frata.in' }) =>
  new Request('https://app.frata.in/api/console/upload/import', { method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ type: 'blob.generate-client-token', payload: { pathname, clientPayload: null, multipart: false } }) })
const path = (tenant: string, folder: string, w: number, ext = 'webp') => `tenants/${tenant}/${folder}/${PHOTO}-${w}.${ext}`
/** What the client token allows (its payload, as @vercel/blob writes it). */
function allowed(clientToken: string) {
  const inner = Buffer.from(clientToken.replace(/^vercel_blob_client_[^_]+_/, ''), 'base64').toString()
  return JSON.parse(Buffer.from(inner.slice(inner.indexOf('.') + 1), 'base64').toString()) as { maximumSizeInBytes: number; validUntil: number; allowedContentTypes: string[]; pathname: string }
}

beforeEach(() => { state.tokens = []; state.allow = true })

describe('the import token route', () => {
  it('a 400 of this shop\'s product photo: counted once, its own cap, 5 minutes', async () => {
    const res = await importPost(ask(path(TENANT, 'products', 400)))
    expect(res.status).toBe(200)
    const t = allowed((await res.json()).clientToken)
    expect(t.maximumSizeInBytes).toBe(512 * 1024)
    expect(t.allowedContentTypes).toEqual(['image/webp'])
    expect(t.validUntil - Date.now()).toBeGreaterThan(4 * 60_000) // clock-ok: a test
    expect(t.validUntil - Date.now()).toBeLessThanOrEqual(5 * 60_000) // clock-ok: a test
    expect(state.tokens).toEqual([[TENANT, PHOTO, 400]])
    expect(allowed((await (await importPost(ask(path(TENANT, 'products', 1600, 'jpg')))).json()).clientToken)).toMatchObject({ maximumSizeInBytes: 3 * 1024 * 1024, allowedContentTypes: ['image/jpeg'] })
  })
  it('refuses another shop\'s folder, the look\'s and the logo\'s, a bucket that says no — none counted but the last', async () => {
    for (const p of [path(OTHER, 'products', 400), path(TENANT, 'theme', 400), path(TENANT, 'brand', 400), `tenants/${TENANT}/documents/${PHOTO}.png`, `tenants/${TENANT}/products/x-400.webp`]) {
      expect((await importPost(ask(p))).status).toBe(400)
    }
    expect(state.tokens).toEqual([])
    state.allow = false
    expect((await importPost(ask(path(TENANT, 'products', 400)))).status).toBe(400)
  })
  it('refuses a missing, foreign or unreadable Origin before anything else', async () => {
    for (const h of [{ host: 'app.frata.in' } as Record<string, string>, { origin: 'https://evil.example', host: 'app.frata.in' }, { origin: 'null', host: 'app.frata.in' },
      { origin: 'https://kesar.frata.store', host: 'kesar.frata.store' }, { origin: 'https://other.vercel.app', host: 'frata.vercel.app' }]) {
      expect((await importPost(ask(path(TENANT, 'products', 400), h))).status).toBe(403)
    }
    expect(state.tokens).toEqual([])
    // A vercel.app alias and the local stack serve the console from their own origin.
    expect((await importPost(ask(path(TENANT, 'products', 400), { origin: 'https://frata.vercel.app', host: 'frata.vercel.app' }))).status).toBe(200)
    expect((await importPost(ask(path(TENANT, 'products', 400), { origin: 'http://localhost:3077', host: 'localhost:3077' }))).status).toBe(200)
  })
})

describe('the editor\'s token route', () => {
  it('the same Origin rule; each size\'s own cap and 5 minutes', async () => {
    expect((await editorPost(ask(path(TENANT, 'products', 400), { origin: 'https://evil.example', host: 'app.frata.in' }))).status).toBe(403)
    const t = allowed((await (await editorPost(ask(path(TENANT, 'products', 800)))).json()).clientToken)
    expect(t.maximumSizeInBytes).toBe(1536 * 1024)
    expect(t.validUntil - Date.now()).toBeLessThanOrEqual(5 * 60_000) // clock-ok: a test
    expect((await editorPost(ask(path(OTHER, 'products', 400)))).status).toBe(400)
  })
})
