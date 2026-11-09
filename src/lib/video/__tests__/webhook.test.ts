import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { muxEventFields, verifyMuxSignature } from '../webhook'

const SECRET = 'whsec_test_current', OLD = 'whsec_test_previous'
const sign = (raw: string, t: number, secret = SECRET) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`
const NOW = 1_794_240_000
const raw = JSON.stringify({ type: 'video.asset.ready', id: 'ev-1' })

describe('verifyMuxSignature', () => {
  it('accepts the body Mux signed, within five minutes', () => {
    expect(verifyMuxSignature(raw, sign(raw, NOW), [SECRET], NOW)).toBe(true)
    expect(verifyMuxSignature(raw, sign(raw, NOW - 299), [SECRET], NOW)).toBe(true)
  })
  it('refuses a signature older or newer than five minutes (a replay)', () => {
    expect(verifyMuxSignature(raw, sign(raw, NOW - 301), [SECRET], NOW)).toBe(false)
    expect(verifyMuxSignature(raw, sign(raw, NOW + 301), [SECRET], NOW)).toBe(false)
  })
  it('refuses a forged or changed body, and a wrong secret', () => {
    expect(verifyMuxSignature(raw + ' ', sign(raw, NOW), [SECRET], NOW)).toBe(false)
    expect(verifyMuxSignature(raw.replace('ev-1', 'ev-2'), sign(raw, NOW), [SECRET], NOW)).toBe(false)
    expect(verifyMuxSignature(raw, sign(raw, NOW, 'someone-else'), [SECRET], NOW)).toBe(false)
  })
  it('accepts the previous secret during a rotation, and never an empty one', () => {
    expect(verifyMuxSignature(raw, sign(raw, NOW, OLD), [SECRET, OLD], NOW)).toBe(true)
    expect(verifyMuxSignature(raw, sign(raw, NOW, ''), ['', ''], NOW)).toBe(false)
    expect(verifyMuxSignature(raw, sign(raw, NOW), [], NOW)).toBe(false)
  })
  it('refuses malformed headers', () => {
    for (const h of [null, '', 'v1=abc', `t=${NOW}`, `t=x,v1=${'a'.repeat(64)}`, `t=${NOW},v1=zz`, 'x'.repeat(1001)]) expect(verifyMuxSignature(raw, h, [SECRET], NOW)).toBe(false)
  })
  it('accepts any one of several v1 signatures', () => {
    expect(verifyMuxSignature(raw, `${sign(raw, NOW)},v1=${'0'.repeat(64)}`, [SECRET], NOW)).toBe(true)
    expect(verifyMuxSignature(raw, `t=${NOW},v1=${'0'.repeat(64)},${sign(raw, NOW).split(',')[1]}`, [SECRET], NOW)).toBe(true)
  })
})

describe('muxEventFields', () => {
  const VID = '0d6c2c1e-1d2b-4a5c-9f00-123456789abc'
  it('reads an upload event: the upload id, the asset, our row from new_asset_settings', () => {
    expect(muxEventFields({ type: 'video.upload.asset_created', id: 'e1', environment: { id: 'prod1' }, data: { id: 'up1', asset_id: 'as1', status: 'asset_created', url: 'https://storage.example/secret', new_asset_settings: { passthrough: VID } } }))
      .toEqual({ env: 'prod1', eventId: 'e1', type: 'video.upload.asset_created', video: VID, uploadId: 'up1', assetId: 'as1', status: 'asset_created' })
  })
  it('reads an asset event: the asset id, its upload, our row', () => {
    expect(muxEventFields({ type: 'video.asset.ready', id: 'e2', environment: { id: 'prod1' }, data: { id: 'as1', upload_id: 'up1', passthrough: VID, status: 'ready' } }))
      .toEqual({ env: 'prod1', eventId: 'e2', type: 'video.asset.ready', video: VID, uploadId: 'up1', assetId: 'as1', status: 'ready' })
  })
  it('reads a rendition event by its asset only', () => {
    expect(muxEventFields({ type: 'video.asset.static_rendition.ready', id: 'e3', environment: { id: 'prod1' }, data: { id: 'r1', asset_id: 'as1', status: 'ready' } }))
      .toEqual({ env: 'prod1', eventId: 'e3', type: 'video.asset.static_rendition.ready', video: null, uploadId: null, assetId: 'as1', status: 'ready' })
  })
  it('drops a passthrough that is not one of our ids, and odd values', () => {
    const f = muxEventFields({ type: 'video.asset.ready', id: 'e4', environment: { id: 'prod1' }, data: { id: 'as-1!', upload_id: 'up1', passthrough: "x' or 1=1", status: 'Ready!' } })
    expect(f).toMatchObject({ video: null, assetId: null, status: null })
  })
  it('is null for anything that is not a Mux envelope', () => {
    for (const b of [null, 1, 'x', {}, { type: 'video.asset.ready', id: 'e', data: {} }, { type: 'other.thing', id: 'e', environment: { id: 'p' }, data: {} }, { type: 'video.asset.ready', id: 'e', environment: { id: 'p' } }])
      expect(muxEventFields(b)).toBeNull()
  })
})
