import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const TOPIC = 'arn:aws:sns:ap-south-1:123456789012:frrata-ses'
let mod: typeof import('../sns')
beforeEach(async () => {
  vi.resetModules()
  process.env.SES_SNS_TOPIC_ARN = TOPIC
  delete process.env.VERCEL; delete process.env.E2E_FIXTURES; delete process.env.SES_API_BASE
  mod = await import('../sns')
})

const base = { Type: 'Notification', MessageId: 'm1', TopicArn: TOPIC, Message: '{"eventType":"Delivery"}', Timestamp: '2026-11-11T10:00:00.000Z',
  SignatureVersion: '2', Signature: 'x', SigningCertURL: 'https://sns.ap-south-1.amazonaws.com/SimpleNotificationService-abc123.pem' }
const now = new Date('2026-11-11T10:05:00Z')

describe('SNS', () => {
  it('string to sign: documented order, Subject only when present, one trailing newline', () => {
    expect(mod.stringToSign(base as never)).toBe('Message\n{"eventType":"Delivery"}\nMessageId\nm1\nTimestamp\n2026-11-11T10:00:00.000Z\nTopicArn\n' + TOPIC + '\nType\nNotification\n')
    expect(mod.stringToSign({ ...base, Subject: 'S' } as never)).toContain('MessageId\nm1\nSubject\nS\nTimestamp')
  })
  it.each([
    ['https://sns.ap-south-1.amazonaws.com/SimpleNotificationService-abc.pem', true],
    ['https://sns.us-east-1.amazonaws.com/SimpleNotificationService-abc.pem', false],
    ['http://sns.ap-south-1.amazonaws.com/SimpleNotificationService-abc.pem', false],
    ['https://sns.ap-south-1.amazonaws.com.evil.com/SimpleNotificationService-abc.pem', false],
    ['https://sns.ap-south-1.amazonaws.com/x/../SimpleNotificationService-abc.pem?x=1', false],
    ['http://127.0.0.1:4050/SimpleNotificationService-abc.pem', false],
  ])('cert url %s → %s', (u, ok) => expect(mod.certUrlOk(u)).toBe(ok))
  it('refuses before fetching anything', async () => {
    const f = vi.spyOn(globalThis, 'fetch')
    const v = (m: object, h = 'Notification') => mod.verifySns(JSON.stringify(m), h, now)
    expect(await v(base, 'SubscriptionConfirmation')).toEqual({ ok: false, reason: 'type_header' })
    expect(await v({ ...base, TopicArn: 'arn:aws:sns:ap-south-1:999999999999:theirs' })).toEqual({ ok: false, reason: 'topic' })
    expect(await v({ ...base, SignatureVersion: '1' })).toEqual({ ok: false, reason: 'version' })
    expect(await v({ ...base, SigningCertURL: 'https://evil.example/x.pem' })).toEqual({ ok: false, reason: 'cert_url' })
    expect(await v({ ...base, Timestamp: '2026-11-11T08:00:00Z' })).toEqual({ ok: false, reason: 'stale' })
    expect(await v({ ...base, Type: 'SubscriptionConfirmation', SubscribeURL: 'https://evil.example/?Action=ConfirmSubscription' }, 'SubscriptionConfirmation')).toEqual({ ok: false, reason: 'subscribe_url' })
    expect(f).not.toHaveBeenCalled()
    f.mockRestore()
  })
  it('subscribe url: our host, the action, our topic', () => {
    expect(mod.subscribeUrlOk(`https://sns.ap-south-1.amazonaws.com/?Action=ConfirmSubscription&TopicArn=${encodeURIComponent(TOPIC)}&Token=t`)).toBe(true)
    expect(mod.subscribeUrlOk(`https://sns.ap-south-1.amazonaws.com/?Action=ConfirmSubscription&TopicArn=other&Token=t`)).toBe(false)
  })
})
