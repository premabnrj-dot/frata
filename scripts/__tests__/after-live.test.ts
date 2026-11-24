import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// An after-live migration (`-- apply: after-live` on its first line) is never printed for production unless named with
// --after-live, and release:check names every one (security review of O1, 2026-11-24: 0177 carried the line, no script read it).
describe('after-live migrations', async () => {
  const { afterLiveMigrations, isAfterLive } = await import('../lib/after-live.mjs')

  it('the marker counts only as the first line', () => {
    expect(isAfterLive('-- apply: after-live\ndrop function x();')).toBe(true)
    expect(isAfterLive('  -- apply: after-live  \n')).toBe(true)
    expect(isAfterLive('-- O1 contract\n-- apply: after-live\n')).toBe(false)
    expect(isAfterLive('create table t ();')).toBe(false)
  })
  it('0177 is one, and 0176 (the expand) is not', () => {
    const found = afterLiveMigrations()
    expect(found).toContain('0177_signup_drop_old_definers.sql')
    expect(found.some((f: string) => f.startsWith('0176_'))).toBe(false)
  })

  const run = (...args: string[]) => spawnSync(process.execPath, ['scripts/prod-migrate.mjs', ...args], { encoding: 'utf8' })
  it('prod-migrate refuses an after-live migration without the flag, and prints nothing to apply', () => {
    const r = run('drizzle/0177_signup_drop_old_definers.sql')
    expect(r.status).toBe(1)
    expect(r.stdout).toBe('')
    expect(r.stderr).toContain('--after-live drizzle/0177_signup_drop_old_definers.sql')
  })
  it('with --after-live it prints the SQL and the drizzle row', () => {
    const r = run('--after-live', 'drizzle/0177_signup_drop_old_definers.sql')
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('-- 1. Apply 0177_signup_drop_old_definers')
    expect(r.stdout).toContain('insert into drizzle.__drizzle_migrations')
  })
  it('an ordinary migration needs no flag', () => {
    expect(execFileSync(process.execPath, ['scripts/prod-migrate.mjs', 'drizzle/0176_signup_without_pickup.sql'], { encoding: 'utf8' })).toContain('-- 1. Apply 0176_')
  })
  it('release:check names every after-live migration (merge-main prints the same line on --check)', () => {
    const r = spawnSync(process.execPath, ['scripts/merge-main.mjs', '--after-live'], { encoding: 'utf8' })
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/after-live migrations .*0177_signup_drop_old_definers\.sql/)
    expect(readFileSync('scripts/merge-main.mjs', 'utf8')).toMatch(/console\.log\(afterLiveLine\(\)\)\nconsole\.log\(bad \?/)
  })
})
