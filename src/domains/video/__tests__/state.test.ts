import { describe, expect, it } from 'vitest'
import { isLive, uploadProblem, videoState, type VideoRow } from '../state'

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
