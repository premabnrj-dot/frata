import { describe, expect, it } from 'vitest'
import { secretsAllowed, signInAllowedIn } from '../stage'

describe('where secrets may be read', () => {
  it('reads them in Production on Vercel, and anywhere off Vercel', () => {
    expect(secretsAllowed('1', 'production')).toBe(true)
    expect(secretsAllowed(undefined, undefined)).toBe(true) // local, e2e, CI
    expect(secretsAllowed('', 'preview')).toBe(true) // not on Vercel: VERCEL unset or empty
    expect(secretsAllowed('1', 'development')).toBe(true) // vercel dev / vercel env pull: a person's own machine
  })
  it('refuses them on a preview, a custom environment, or Vercel with no stage', () => {
    expect(secretsAllowed('1', 'preview')).toBe(false)
    expect(secretsAllowed('1', 'staging')).toBe(false)
    expect(secretsAllowed('1', undefined)).toBe(false)
    expect(secretsAllowed('1', '')).toBe(false)
  })
  it('turns sign-in off in the browser on a preview or custom environment only', () => {
    expect(signInAllowedIn('production')).toBe(true)
    expect(signInAllowedIn('')).toBe(true)
    expect(signInAllowedIn(undefined)).toBe(true)
    expect(signInAllowedIn('preview')).toBe(false)
    expect(signInAllowedIn('staging')).toBe(false)
  })
})
