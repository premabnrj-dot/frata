import { describe, expect, it } from 'vitest'
import { mp4ReadyFor, parseAsset, UPLOAD_SETTINGS, uploadSettings } from '../mux'

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

// PV·1: a product's video asks for one 720p MP4 (shop and feeds); a loop's settings are unchanged.
describe('uploadSettings by use', () => {
  it('a loop keeps highest; a product asks for no MP4 at upload (720p is added after the checks)', () => {
    expect(uploadSettings('loop')).toEqual(UPLOAD_SETTINGS)
    expect(uploadSettings('product')).toEqual({ video_quality: 'basic', playback_policies: ['public'] })
  })
})

describe('parseAsset renditions', () => {
  it('reports each rendition by resolution, and whether the use\'s MP4 is ready', () => {
    const a = parseAsset({ ...asset, static_renditions: { files: [{ name: '720p.mp4', resolution: '720p', status: 'ready' }] } })!
    expect(a.renditions).toEqual({ '720p': 'ready' })
    expect(mp4ReadyFor(a, 'product')).toBe(true)
    expect(mp4ReadyFor(a, 'loop')).toBe(false)
    expect(a.mp4Ready).toBe(false)
  })
  it('a 720p Mux skipped (a smaller source) reads as skipped', () => {
    const a = parseAsset({ ...asset, static_renditions: { files: [{ name: '720p.mp4', resolution: '720p', status: 'skipped' }] } })!
    expect(a.renditions['720p']).toBe('skipped')
    expect(mp4ReadyFor(a, 'product')).toBe(false)
  })
})
