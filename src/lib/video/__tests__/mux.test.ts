import { describe, expect, it } from 'vitest'
import { parseAsset, UPLOAD_SETTINGS } from '../mux'

const asset = {
  id: 'as1', status: 'ready', passthrough: 'row', upload_id: 'up1', duration: 12.48,
  playback_ids: [{ id: 'signedOnly', policy: 'signed' }, { id: 'pub123', policy: 'public' }],
  tracks: [{ type: 'audio' }, { type: 'video', max_width: 1280, max_height: 720 }],
  static_renditions: { files: [{ name: 'highest.mp4', resolution: 'highest', status: 'ready' }] },
}

describe('parseAsset', () => {
  it('reads what the shop needs: the public playback id, length, size, whether the MP4 is ready', () => {
    expect(parseAsset(asset)).toEqual({ id: 'as1', status: 'ready', passthrough: 'row', uploadId: 'up1', playbackId: 'pub123', durationMs: 12480, width: 1280, height: 720, mp4Ready: true })
  })
  it('a source larger than 720p plays the 720p file; a smaller one plays highest (Mux skips 720p there)', () => {
    const big = { ...asset, tracks: [{ type: 'video', max_width: 1080, max_height: 1920 }] }
    expect(parseAsset({ ...big, static_renditions: { files: [{ name: 'highest.mp4', resolution: 'highest', status: 'ready' }, { name: '720p.mp4', resolution: '720p', status: 'preparing' }] } })?.mp4Ready).toBe(false)
    expect(parseAsset({ ...big, static_renditions: { files: [{ name: '720p.mp4', resolution: '720p', status: 'ready' }] } })?.mp4Ready).toBe(true)
    expect(parseAsset({ ...asset, static_renditions: { files: [{ name: '720p.mp4', resolution: '720p', status: 'skipped' }, { name: 'highest.mp4', resolution: 'highest', status: 'ready' }] } })?.mp4Ready).toBe(true)
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
  it('holds the reviews\' decisions: basic, public, a 720p and a highest MP4, no tier Mux refuses', () => {
    expect(UPLOAD_SETTINGS).toEqual({ video_quality: 'basic', playback_policies: ['public'], static_renditions: [{ resolution: '720p' }, { resolution: 'highest' }] })
    // Mux's max_resolution_tier takes 1080p, 1440p or 2160p only (2026-11-09: 720p made every upload a 400).
    expect('max_resolution_tier' in UPLOAD_SETTINGS).toBe(false)
  })
})
