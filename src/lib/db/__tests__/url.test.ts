import { describe, expect, it } from 'vitest'
import { parseDatabaseUrl } from '../url'

// An obviously fake password, shaped like base64 so it contains a `/`.
const FAKE = 'fake/pass+word'

describe('parseDatabaseUrl', () => {
  it('accepts the frata_app pooler URL', () => {
    const ok = 'postgresql://frata_app.abc123:deadbeef@aws-0-ap-south-1.pooler.supabase.com:6543/postgres'
    expect(parseDatabaseUrl(ok)).toBe(ok)
  })
  it('refuses an unparseable URL without echoing the password', () => {
    const bad = `postgresql://frata_app.abc123:${FAKE}@host:6543/postgres`
    expect(() => parseDatabaseUrl(bad)).toThrow(/not a valid URL/)
    try { parseDatabaseUrl(bad) } catch (e) { expect(String(e)).not.toContain(FAKE) }
  })
  it('refuses the postgres role, which bypasses the tenant policies', () => {
    expect(() => parseDatabaseUrl('postgresql://postgres.abc123:x@host:6543/postgres')).toThrow(/frata_app/)
    expect(() => parseDatabaseUrl('postgresql://postgres.frata_app.abc123:x@host:6543/postgres')).toThrow(/frata_app/)
  })
  it('refuses an empty value', () => {
    expect(() => parseDatabaseUrl('')).toThrow(/not set/)
  })
})
