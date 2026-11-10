import { describe, expect, it } from 'vitest'
import { capPlan, clock, isLive, PRODUCT_VIDEO_CAPS, uploadProblem, USE_LIMITS, videoShape, videoState, type VideoRow } from '../state'

const T0 = new Date('2026-11-09T10:00:00Z')
const at = (s: number) => new Date(T0.getTime() + s * 1000)
const row = (o: Partial<VideoRow> = {}): VideoRow => ({ uploadId: null, playbackId: null, createdAt: T0, readyAt: null, mp4ReadyAt: null, erroredAt: null, error: null, removedAt: null, ...o })

describe('videoState', () => {
  it('walks uploading → preparing → playable', () => {
    expect(videoState(row({ uploadId: 'up' }), at(30)).kind).toBe('uploading')
    expect(videoState(row({ uploadId: 'up', readyAt: at(60), playbackId: 'pb' }), at(70)).kind).toBe('preparing')
    expect(videoState(row({ uploadId: 'up', readyAt: at(60), mp4ReadyAt: at(80), playbackId: 'pb' }), at(90))).toEqual({ kind: 'playable', playbackId: 'pb' })
  })
  it('a row Mux never confirmed is "didn\'t work" after 2 minutes', () => {
    expect(videoState(row(), at(119)).kind).toBe('uploading')
    expect(videoState(row(), at(121))).toEqual({ kind: 'failed', why: 'didnt_work' })
  })
  it('a lost webhook: never ready 25 minutes on is "didn\'t work"', () => {
    expect(videoState(row({ uploadId: 'up' }), at(1499)).kind).toBe('uploading')
    expect(videoState(row({ uploadId: 'up', readyAt: at(60) }), at(1501))).toEqual({ kind: 'failed', why: 'didnt_work' })
  })
  it('too long says so; removed wins over everything', () => {
    expect(videoState(row({ erroredAt: at(5), error: 'too_long' }), at(6))).toEqual({ kind: 'failed', why: 'too_long' })
    expect(videoState(row({ mp4ReadyAt: at(5), readyAt: at(5), playbackId: 'pb', removedAt: at(9) }), at(10)).kind).toBe('removed')
  })
  it('only pending and playable videos count toward the 20', () => {
    expect(isLive(row({ uploadId: 'up' }), at(10))).toBe(true)
    expect(isLive(row({ erroredAt: at(1), error: 'x' }), at(10))).toBe(false)
    expect(isLive(row({ removedAt: at(1) }), at(10))).toBe(false)
  })
})

describe('uploadProblem', () => {
  it('takes MP4 and MOV up to 64 MB', () => {
    expect(uploadProblem('video/mp4', 1)).toBeNull()
    expect(uploadProblem('video/quicktime', 64 * 1024 * 1024)).toBeNull()
  })
  it('refuses other types, empty and oversized files', () => {
    expect(uploadProblem('video/webm', 10)).toMatch(/MP4 or MOV/)
    expect(uploadProblem('video/mp4', 0)).toMatch(/Choose a video/)
    expect(uploadProblem('video/mp4', 64 * 1024 * 1024 + 1)).toMatch(/64 MB/)
  })
})

// PV·1 (docs/plans/2026-11-10-product-video-pv1.md): a product's video has its own limits; a loop's are unchanged.
describe('product videos', () => {
  const p = (o: Partial<VideoRow> = {}): VideoRow => row({ use: 'product', ...o })
  it('limits per use: a loop ≤ 15 s and 64 MB, a product 6–60 s and 250 MB', () => {
    expect(USE_LIMITS.loop).toMatchObject({ maxMs: 15_000, minMs: 0, maxBytes: 64 * 1024 * 1024, timeoutS: 900 })
    expect(USE_LIMITS.product).toMatchObject({ maxMs: 60_000, minMs: 6_000, maxBytes: 250 * 1024 * 1024, timeoutS: 3600, rendition: '720p' })
  })
  it('a product upload has the hour Mux gives it, then ten minutes, before "didn\'t work"', () => {
    expect(videoState(p({ uploadId: 'up' }), at(3600 + 599)).kind).toBe('uploading')
    expect(videoState(p({ uploadId: 'up' }), at(3600 + 601))).toEqual({ kind: 'failed', why: 'didnt_work' })
  })
  it('too long, too short and under 720p each say so', () => {
    expect(videoState(p({ erroredAt: at(5), error: 'too_long' }), at(6))).toEqual({ kind: 'failed', why: 'too_long' })
    expect(videoState(p({ erroredAt: at(5), error: 'too_short' }), at(6))).toEqual({ kind: 'failed', why: 'too_short' })
    expect(videoState(p({ erroredAt: at(5), error: 'too_small' }), at(6))).toEqual({ kind: 'failed', why: 'too_small' })
  })
  it('uploadProblem by use: 250 MB for a product, 64 MB for a loop', () => {
    expect(uploadProblem('video/quicktime', 250 * 1024 * 1024, 'product')).toBeNull()
    expect(uploadProblem('video/mp4', 250 * 1024 * 1024 + 1, 'product')).toMatch(/250 MB/)
    expect(uploadProblem('video/mp4', 64 * 1024 * 1024 + 1)).toMatch(/64 MB/)
  })
  it('the shape a shopper sees, from the file', () => {
    expect(videoShape(1080, 1920)).toBe('reel')
    expect(videoShape(1920, 1080)).toBe('film')
    expect(videoShape(1080, 1080)).toBe('square')
    expect(videoShape(1080, 1350)).toBe('reel')
    expect(videoShape(null, null)).toBeNull()
  })
  it('the length in minutes and seconds', () => {
    expect(clock(24_400)).toBe('0:24')
    expect(clock(59_600)).toBe('1:00')
    expect(clock(6_000)).toBe('0:06')
  })
})

describe('product video caps by plan (owner, 2026-11-10)', () => {
  it('a trial reads trial; a plan its own; none reads Launch; each plan more generous than the last', () => {
    expect(capPlan('scale', true)).toBe('trial')
    expect(capPlan('growth', false)).toBe('growth')
    expect(capPlan(null, false)).toBe('launch')
    const order = (['trial', 'launch', 'growth', 'scale'] as const).map((k) => PRODUCT_VIDEO_CAPS[k])
    for (let i = 1; i < order.length; i++) for (const f of ['perDay', 'perMonth', 'live', 'minutes'] as const) expect(order[i]![f]).toBeGreaterThan(order[i - 1]![f])
  })
})
