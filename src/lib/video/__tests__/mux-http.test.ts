import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn()
vi.mock('@/lib/http/timeout', () => ({ fetchWithTimeout: (...a: unknown[]) => fetchMock(...a) }))
vi.mock('@/lib/env', () => ({ MUX_API_BASE: 'https://api.mux.com', MUX_TOKEN_ID: 'tid', MUX_TOKEN_SECRET: 'tsecret' }))
const { cancelUpload, createRendition, createUpload, deleteAsset, getAsset } = await import('../mux')

const reply = (status: number, json?: unknown) => ({ status, json: async () => json })
beforeEach(() => fetchMock.mockReset())

describe('createUpload', () => {
  it('sends the decided settings with our row id as passthrough, Basic auth, and hands back only id and URL', async () => {
    fetchMock.mockResolvedValue(reply(201, { data: { id: 'up1', url: 'https://storage.googleapis.com/video-uploads/x?sig=1', status: 'waiting' } }))
    expect(await createUpload('row-1', 'https://frata.vercel.app')).toEqual({ ok: true, uploadId: 'up1', url: 'https://storage.googleapis.com/video-uploads/x?sig=1' })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.mux.com/video/v1/uploads')
    expect(init.headers.authorization).toBe(`Basic ${Buffer.from('tid:tsecret').toString('base64')}`)
    expect(JSON.parse(init.body)).toEqual({ cors_origin: 'https://frata.vercel.app', timeout: 900, new_asset_settings: { video_quality: 'basic', playback_policies: ['public'], static_renditions: [{ resolution: 'highest' }], passthrough: 'row-1' } })
  })
  it('a product video asks for no MP4 and an hour to upload (PV·1)', async () => {
    fetchMock.mockResolvedValue(reply(201, { data: { id: 'up2', url: 'https://storage.googleapis.com/video-uploads/y?sig=1', status: 'waiting' } }))
    await createUpload('row-2', 'https://frata.vercel.app', 'product')
    const [, init] = fetchMock.mock.calls[0]!
    expect(JSON.parse(init.body)).toEqual({ cors_origin: 'https://frata.vercel.app', timeout: 3600, new_asset_settings: { video_quality: 'basic', playback_policies: ['public'], passthrough: 'row-2' } })
  })
  it('adds the 720p rendition to a ready asset; a gone asset is done', async () => {
    fetchMock.mockResolvedValueOnce(reply(201, { data: { id: 'r1', status: 'preparing', resolution: '720p', name: '720p.mp4' } }))
    expect(await createRendition('as1', '720p')).toEqual({ ok: true, gone: false })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.mux.com/video/v1/assets/as1/static-renditions'); expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ resolution: '720p' })
    fetchMock.mockResolvedValueOnce(reply(404, {}))
    expect(await createRendition('as1', '720p')).toEqual({ ok: true, gone: true })
    expect(await createRendition('../x', '720p')).toEqual({ ok: false, why: 'refused' })
  })
  it('never hands a non-https URL to the browser', async () => {
    fetchMock.mockResolvedValue(reply(201, { data: { id: 'up1', url: 'http://evil.example/x' } }))
    expect(await createUpload('row-1', 'https://frata.vercel.app')).toEqual({ ok: false, why: 'bad_reply' })
  })
  it('says why when Mux refuses, limits or is down', async () => {
    fetchMock.mockResolvedValueOnce(reply(429)).mockResolvedValueOnce(reply(503)).mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(400)).mockRejectedValueOnce(new Error('timeout'))
    expect((await createUpload('r', 'o')) as unknown).toEqual({ ok: false, why: 'rate_limited' })
    expect((await createUpload('r', 'o')) as unknown).toEqual({ ok: false, why: 'unavailable' })
    // A wrong token is retried, never "Mux refused this request".
    expect((await createUpload('r', 'o')) as unknown).toEqual({ ok: false, why: 'unauthorized' })
    expect((await createUpload('r', 'o')) as unknown).toEqual({ ok: false, why: 'refused' })
    expect((await createUpload('r', 'o')) as unknown).toEqual({ ok: false, why: 'unavailable' })
  })
})

describe('getAsset, deleteAsset, cancelUpload', () => {
  it('a 404 is no asset, and a delete of a gone asset is done', async () => {
    fetchMock.mockResolvedValue(reply(404))
    expect(await getAsset('as1')).toEqual({ ok: true, asset: null })
    expect(await deleteAsset('as1')).toEqual({ ok: true })
  })
  it('a delete that fails stays failed (the outbox retries it)', async () => {
    fetchMock.mockResolvedValue(reply(503))
    expect(await deleteAsset('as1')).toEqual({ ok: false, why: 'unavailable' })
  })
  it('refuses an id that could change the path, without calling Mux', async () => {
    expect(await getAsset('../uploads')).toEqual({ ok: false, why: 'refused' })
    expect(await deleteAsset('as1/../x')).toEqual({ ok: false, why: 'refused' })
    expect(await cancelUpload('up 1')).toEqual({ ok: false, why: 'refused' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('cancelling an upload that already finished is done', async () => {
    fetchMock.mockResolvedValue(reply(400))
    expect(await cancelUpload('up1')).toEqual({ ok: true })
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.mux.com/video/v1/uploads/up1/cancel')
  })
})
