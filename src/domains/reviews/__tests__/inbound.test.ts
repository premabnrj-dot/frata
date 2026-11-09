import { describe, expect, it } from 'vitest'
import { inbound } from '../inbound'
import { REVIEW_TEMPLATE, STOP_PAYLOAD } from '../template'

const W = 'wamid.HBgMOTE5ODI5MDQzMjEwFQIAERgS'
describe('what Meta tells Reviews (6b-2)', () => {
  it('a Stop press, matched on the ask it answers (no phone needed)', () => {
    expect(inbound('messages', { message: { type: 'button', button: { payload: STOP_PAYLOAD, text: 'Stop' }, context: { id: W } } })).toEqual({ kind: 'stop', wamid: W })
    expect(inbound('messages', { message: { type: 'button', button: { payload: 'other' }, context: { id: W } } })).toBeNull()
    expect(inbound('messages', { message: { type: 'text', text: { body: 'stop' } } })).toBeNull()
  })
  it('a failed delivery with its code', () => {
    expect(inbound('messages', { status: { id: W, status: 'failed', errors: [{ code: 131026 }] } })).toEqual({ kind: 'failed', wamid: W, code: 131026 })
    expect(inbound('messages', { status: { id: W, status: 'delivered' } })).toBeNull()
  })
  it('template status: approved, reinstated and unarchived are sendable; everything else stops; the id is a string', () => {
    const t = (event: string) => inbound('message_template_status_update', { event, message_template_id: 1689556908129832, message_template_name: REVIEW_TEMPLATE, message_template_category: 'UTILITY' })
    expect(t('APPROVED')).toEqual({ kind: 'template', id: '1689556908129832', status: 'APPROVED', category: 'UTILITY' })
    expect(t('REINSTATED')!).toMatchObject({ status: 'APPROVED' })
    for (const e of ['PAUSED', 'DISABLED', 'FLAGGED', 'LOCKED', 'REJECTED']) expect(t(e)!).toMatchObject({ status: e })
    expect(inbound('message_template_status_update', { event: 'APPROVED', message_template_name: 'someone_elses' })).toBeNull()
  })
  it('a category notice to MARKETING stops sends at once', () => {
    expect(inbound('template_category_update', { message_template_id: 99, message_template_name: REVIEW_TEMPLATE, new_category: 'UTILITY', correct_category: 'MARKETING' })).toEqual({ kind: 'template', id: '99', status: null, category: 'MARKETING' })
  })
})
