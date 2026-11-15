import { describe, expect, it } from 'vitest'
import { isEmailLinkType, signInLink } from '../email-link'

describe('the sign-in email link (T1b)', () => {
  it('opens /auth/confirm on the console host, https in production', () => {
    expect(signInLink('frata.vercel.app', 'pkce_abcdefghijklmnopqrst', 'magiclink')).toBe('https://frata.vercel.app/auth/confirm?token_hash=pkce_abcdefghijklmnopqrst&type=magiclink')
    expect(signInLink('localhost:3077', 'h'.repeat(24), 'email')).toBe(`http://localhost:3077/auth/confirm?token_hash=${'h'.repeat(24)}&type=email`)
  })
  it('sends sign-in emails only, never an address change', () => {
    expect(isEmailLinkType('magiclink')).toBe(true)
    expect(isEmailLinkType('email_change')).toBe(false)
    expect(isEmailLinkType('recovery')).toBe(false)
  })
})
