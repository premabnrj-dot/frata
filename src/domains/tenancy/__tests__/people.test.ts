import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mayAddPartner, mayGive, requestState, ROLES_GIVEN_BY } from '../people'

describe('who may give which role', () => {
  it('owner gives Manager, Staff, Accountant; a Manager gives Staff and Accountant; nobody gives owner or partner', () => {
    expect(mayGive('owner', 'admin')).toBe(true)
    expect(mayGive('admin', 'admin')).toBe(false)
    expect(mayGive('admin', 'staff')).toBe(true)
    for (const c of ['owner', 'admin', 'staff', 'partner', 'accountant']) {
      expect(mayGive(c, 'owner')).toBe(false)
      expect(mayGive(c, 'partner')).toBe(false)
    }
    expect(mayGive('staff', 'staff')).toBe(false)
    expect(mayAddPartner('owner')).toBe(true)
    expect(mayAddPartner('admin')).toBe(false)
  })
  it('matches the SQL mirror in drizzle/0174', () => {
    const sqlText = readFileSync('drizzle/0174_people_access.sql', 'utf8')
    const fn = sqlText.slice(sqlText.indexOf('function app_people_may_give'), sqlText.indexOf('$$;', sqlText.indexOf('function app_people_may_give')))
    const list = (caller: string) => fn.match(new RegExp(`when '${caller}' then p_role in \\(([^)]*)\\)`))![1]!.split(',').map((s) => s.trim().replace(/'/g, ''))
    expect(list('owner')).toEqual([...ROLES_GIVEN_BY.owner])
    expect(list('admin')).toEqual([...ROLES_GIVEN_BY.admin])
  })
})

describe('requestState', () => {
  const now = new Date('2026-11-23T12:00:00Z')
  const base = { expiresAt: new Date('2026-12-07T12:00:00Z'), acceptedAt: null, declinedAt: null, cancelledAt: null }
  it('derives each state from its stamps', () => {
    expect(requestState(base, now)).toBe('open')
    expect(requestState({ ...base, expiresAt: new Date('2026-11-01') }, now)).toBe('expired')
    expect(requestState({ ...base, acceptedAt: now }, now)).toBe('accepted')
    expect(requestState({ ...base, declinedAt: now }, now)).toBe('declined')
    expect(requestState({ ...base, cancelledAt: now }, now)).toBe('cancelled')
  })
})
