import { describe, expect, it } from 'vitest'
import { cityLabel, deviceLabel, maskEmail, partnerReturnPath, returnLabel } from '../passkeys'
import { passkeyProvider } from '@/domains/auth/passkey-providers'

describe('partner sign-in rules (T1b)', () => {
  it('names the device the way an approver reads it', () => {
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36')).toBe('Chrome on Android')
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe('Safari on iPhone')
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0')).toBe('Edge on Windows')
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36')).toBe('Samsung Internet on Android')
    expect(deviceLabel('curl/8.0')).toBeNull()
    expect(deviceLabel(null)).toBeNull()
  })
  it('takes a city only as a plain place name', () => {
    expect(cityLabel('New%20Delhi')).toBe('New Delhi')
    expect(cityLabel('Pune')).toBe('Pune')
    expect(cityLabel('%3Cscript%3E')).toBeNull()
    expect(cityLabel('%E0%A4%')).toBeNull()
    expect(cityLabel('x'.repeat(80))).toBeNull()
  })
  it('returns only to a workspace page, never the sign-in page or a URL', () => {
    expect(partnerReturnPath('/partner/team')).toBe('/partner/team')
    expect(partnerReturnPath('/partner')).toBe('/partner')
    expect(partnerReturnPath('/partner/sign-in')).toBe('/partner')
    expect(partnerReturnPath('//evil.example/partner')).toBe('/partner')
    expect(partnerReturnPath('https://evil.example')).toBe('/partner')
    expect(partnerReturnPath('/console')).toBe('/partner')
    expect(partnerReturnPath(null)).toBe('/partner')
    expect(returnLabel('/partner/team')).toBe('Team')
    expect(returnLabel('/partner/unknown')).toBe('Clients')
  })
  it('masks an email to its first letter and domain', () => {
    expect(maskEmail('pia@pixelthread.in')).toBe('p•••@pixelthread.in')
    expect(maskEmail('nope')).toBe('nope')
  })
  it('names a passkey by its password manager, else nothing', () => {
    expect(passkeyProvider('EA9B8D66-4D01-1D21-3CE4-B6B48CB575D4')).toBe('Google Password Manager')
    expect(passkeyProvider('00000000-0000-0000-0000-000000000000')).toBeNull()
    expect(passkeyProvider(null)).toBeNull()
  })
})
