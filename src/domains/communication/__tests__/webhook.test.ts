import { describe, expect, it } from 'vitest'
import { splitWebhook } from '../webhook'

const meta = { display_phone_number: '919845012345', phone_number_id: '200000000001' }
const post = (changes: object[], id = '100000000001') => ({ object: 'whatsapp_business_account', entry: [{ id, changes }] })

describe('splitWebhook', () => {
  it('one row per message and per status, the status in the key', () => {
    const items = splitWebhook(post([{ field: 'messages', value: { metadata: meta, messages: [{ id: 'wamid.A1xyz' }, { id: 'wamid.B2xyz' }],
      statuses: [{ id: 'wamid.C3xyz', status: 'delivered' }, { id: 'wamid.C3xyz', status: 'read' }] } }]))
    expect(items.map((i) => i.key)).toEqual(['200000000001:message:wamid.A1xyz', '200000000001:message:wamid.B2xyz',
      '200000000001:status:wamid.C3xyz:delivered', '200000000001:status:wamid.C3xyz:read'])
    expect(items.every((i) => i.route.by === 'number' && i.route.id === '200000000001')).toBe(true)
  })
  it('account changes route by the account and are keyed by digest', () => {
    const [i] = splitWebhook(post([{ field: 'phone_number_quality_update', value: { display_phone_number: '919845012345', event: 'FLAGGED' } }]))
    expect(i).toMatchObject({ route: { by: 'account', id: '100000000001' }, digest: true, key: null })
  })
  it('crafted ids, other objects and junk store nothing', () => {
    expect(splitWebhook(post([{ field: 'messages', value: { metadata: { phone_number_id: '1 or 1=1' }, messages: [{ id: 'wamid.A1xyz' }] } }]))).toEqual([])
    expect(splitWebhook(post([{ field: 'account_update', value: {} }], 'abc'))).toEqual([])
    expect(splitWebhook({ object: 'page', entry: [] })).toEqual([])
    expect(splitWebhook('nope')).toEqual([])
    expect(splitWebhook(post([{ field: 'messages', value: { metadata: meta, messages: [{ id: "x'; drop" }] } }]))).toEqual([])
  })
  it('an account change carries the entry time, so the same event later is a new row', () => {
    const at = (time: number) => splitWebhook({ object: 'whatsapp_business_account', entry: [{ id: '100000000001', time, changes: [{ field: 'account_update', value: { event: 'PARTNER_REMOVED' } }] }] })[0]!.at
    expect(at(1794080000)).toBe(1794080000); expect(at(1794090000)).toBe(1794090000)
  })
  it('a history sync routes by its number and is kept', () => {
    const [i] = splitWebhook(post([{ field: 'history', value: { metadata: meta, history: [{ threads: [] }] } }]))
    expect(i).toMatchObject({ route: { by: 'number', id: '200000000001' }, field: 'history', digest: true })
  })
  it('echoes from the Business app are their own rows', () => {
    expect(splitWebhook(post([{ field: 'smb_message_echoes', value: { metadata: meta, message_echoes: [{ id: 'wamid.E1xyz' }] } }]))[0]!.key).toBe('200000000001:echo:wamid.E1xyz')
  })
})
