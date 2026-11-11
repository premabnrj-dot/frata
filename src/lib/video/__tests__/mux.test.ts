import { describe, expect, it } from 'vitest'
import { mp4ReadyFor, parseAsset, UPLOAD_SETTINGS, uploadSettings } from '../mux'
import { loopMp4, mp4Of } from '@/domains/video/state'

const asset = {
  id: 'as1', status: 'ready', passthrough: 'row', upload_id: 'up1', duration: 12.48,
  playback_ids: [{ id: 'signedOnly', policy: 'signed' }, { id: 'pub123', policy: 'public' }],
  tracks: [{ type: 'audio' }, { type: 'video', max_width: 1280, max_height: 720 }],
  static_renditions: { files: [{ name: 'highest.mp4', resolution: 'highest', status: 'ready' }] },
}

describe('parseAsset', () => {
  it('reads what the shop needs: the public playback id, length, size, whether the MP4 is ready', () => {
    expect(parseAsset(asset)).toEqual({ id: 'as1', status: 'ready', passthrough: 'row', uploadId: 'up1', playbackId: 'pub123', durationMs: 12480, width: 1280, height: 720, mp4Ready: true, renditions: { highest: 'ready' } })
  })
  it('the MP4 is ready only when Mux says that file is ready', () => {
    expect(parseAsset({ ...asset, static_renditions: { files: [{ name: 'highest.mp4', resolution: 'highest', status: 'preparing' }] } })?.mp4Ready).toBe(false)
    expect(parseAsset({ ...asset, static_renditions: undefined })?.mp4Ready).toBe(false)
  })
  it('never takes a signed playback id, or odd sizes', () => {
    expect(parseAsset({ ...asset, playback_ids: [{ id: 'signedOnly', policy: 'signed' }] })?.playbackId).toBeNull()
    expect(parseAsset({ ...asset, tracks: [{ type: 'video', max_width: -1, max_height: 1e9 }] })).toMatchObject({ width: null, height: null })
  })
  it('an unknown status reads as preparing; a missing or bad id is no asset', () => {
    expect(parseAsset({ ...asset, status: 'weird' })?.status).toBe('preparing')
    expect(parseAsset({ ...asset, id: '../x' })).toBeNull()
    expect(parseAsset(null)).toBeNull()
  })
})

describe('UPLOAD_SETTINGS', () => {
  it('basic, public, one highest MP4, and nothing Mux refuses', () => {
    expect(UPLOAD_SETTINGS).toEqual({ video_quality: 'basic', playback_policies: ['public'], static_renditions: [{ resolution: 'highest' }] })
    // Mux refuses a tier below 1080p, and `highest` mixed with sized renditions (2026-11-09: both 400s in production).
    expect('max_resolution_tier' in UPLOAD_SETTINGS).toBe(false)
  })
})

// PV·1 and TS1b: neither use asks for an MP4 at upload; its sized one is added after the checks (a product's 720p, a
// loop's loopMp4). V1's loops were uploaded with UPLOAD_SETTINGS and keep playing their `highest`.
describe('uploadSettings by use', () => {
  it('no MP4 at upload, for a loop and a product alike', () => {
    expect(uploadSettings('loop')).toEqual({ video_quality: 'basic', playback_policies: ['public'] })
    expect(uploadSettings('product')).toEqual({ video_quality: 'basic', playback_policies: ['public'] })
  })
})

describe('parseAsset renditions', () => {
  it('reports each rendition by resolution, and whether the use\'s MP4 is ready', () => {
    const a = parseAsset({ ...asset, static_renditions: { files: [{ name: '720p.mp4', resolution: '720p', status: 'ready' }] } })!
    expect(a.renditions).toEqual({ '720p': 'ready' })
    expect(mp4ReadyFor(a, mp4Of({ use: 'product' }))).toBe(true)
    expect(mp4ReadyFor(a, mp4Of({ use: 'loop' }))).toBe(false)
    expect(mp4ReadyFor(a, mp4Of({ use: 'loop', mp4: '720p' }))).toBe(true)
    expect(a.mp4Ready).toBe(false)
  })
  it('a 720p Mux skipped (a smaller source) reads as skipped', () => {
    const a = parseAsset({ ...asset, static_renditions: { files: [{ name: '720p.mp4', resolution: '720p', status: 'skipped' }] } })!
    expect(a.renditions['720p']).toBe('skipped')
    expect(mp4ReadyFor(a, '720p')).toBe(false)
  })
})

describe('a loop\'s MP4 (TS1b, owner 2026-11-11: loops play 720p)', () => {
  it('720p from 720p and up; from a smaller source the largest size it fills; V1 rows keep highest', () => {
    expect(loopMp4(1920, 1080)).toBe('720p'); expect(loopMp4(1080, 1920)).toBe('720p'); expect(loopMp4(1280, 720)).toBe('720p')
    expect(loopMp4(960, 540)).toBe('540p'); expect(loopMp4(640, 360)).toBe('360p'); expect(loopMp4(200, 100)).toBe('270p')
    expect(loopMp4(null, null)).toBe('720p')
    expect(mp4Of({ use: 'loop' })).toBe('highest'); expect(mp4Of({ use: 'loop', mp4: '540p' })).toBe('540p'); expect(mp4Of({ use: 'product' })).toBe('720p')
  })
})
