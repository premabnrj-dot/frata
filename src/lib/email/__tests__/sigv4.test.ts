import { describe, expect, it } from 'vitest'
import { signV4 } from '../sigv4'

// AWS SigV4 test suite, "get-vanilla" (aws-sig-v4-test-suite): the known signature for these inputs.
describe('signV4', () => {
  it('matches AWS get-vanilla', () => {
    const h = signV4({ method: 'GET', url: 'https://example.amazonaws.com/', body: '', headers: {}, region: 'us-east-1', service: 'service',
      creds: { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' }, now: new Date('2015-08-30T12:36:00Z') })
    expect(h.authorization).toBe('AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31')
  })
  it('signs the session token', () => {
    const h = signV4({ method: 'POST', url: 'https://email.ap-south-1.amazonaws.com/v2/email/outbound-emails', body: '{}', headers: { 'content-type': 'application/json' }, region: 'ap-south-1', service: 'ses',
      creds: { accessKeyId: 'A', secretAccessKey: 'S', sessionToken: 'T' }, now: new Date('2026-11-11T00:00:00Z') })
    expect(h.authorization).toContain('SignedHeaders=content-type;host;x-amz-date;x-amz-security-token')
    expect(h['x-amz-security-token']).toBe('T')
  })
})
