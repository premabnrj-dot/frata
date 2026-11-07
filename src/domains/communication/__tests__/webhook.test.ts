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
  it('echoes from the Business app are their own rows', () => {
    expect(splitWebhook(post([{ field: 'smb_message_echoes', value: { metadata: meta, message_echoes: [{ id: 'wamid.E1xyz' }] } }]))[0]!.key).toBe('200000000001:echo:wamid.E1xyz')
  })
})
