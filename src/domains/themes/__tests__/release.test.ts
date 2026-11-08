import { describe, expect, it } from 'vitest'
import { availableTo, isBaseline, latestAvailable, liveOf, releaseProblems, versionState, withdrawnKeys, type VersionRow } from '../release'
import { CATALOGUE } from '../catalogue'

const row = (version: string, over: Partial<VersionRow> = {}): VersionRow => ({ id: `id-${version}`, themeKey: 'editorial', version, releasedAt: null, recalledAt: null, withdrawnAt: null, ...over })
const t = new Date('2026-11-08T10:00:00Z')

describe('theme versions (T3)', () => {
  it('state comes from the timestamps', () => {
    expect(versionState(null)).toBe('deployed')
    expect(versionState(row('1.1.0'))).toBe('added')
    expect(versionState(row('1.1.0'), 2)).toBe('staged')
    expect(versionState(row('1.1.0', { releasedAt: t }))).toBe('released')
    expect(versionState(row('1.1.0', { releasedAt: t, recalledAt: t }))).toBe('recalled')
    expect(versionState(row('1.1.0', { releasedAt: t, recalledAt: t, withdrawnAt: t }))).toBe('withdrawn')
  })
  it('a shop may start on a released version or one staged to it; never a recalled or withdrawn one', () => {
    expect(availableTo(null, false)).toBe(false)
    expect(availableTo(row('1.1.0'), false)).toBe(false)
    expect(availableTo(row('1.1.0'), true)).toBe(true)
    expect(availableTo(row('1.1.0', { releasedAt: t }), false)).toBe(true)
    expect(availableTo(row('1.1.0', { releasedAt: t, recalledAt: t }), true)).toBe(false)
    expect(availableTo(row('1.1.0', { releasedAt: t, withdrawnAt: t }), false)).toBe(false)
  })
  it('latest available: the newest a shop may use, from the versions in this build', () => {
    const code = Object.values(CATALOGUE.editorial!)
    const rows = [row('1.0.0', { releasedAt: t }), row('1.1.0')]
    expect(latestAvailable('editorial', code, rows, new Set())?.version).toBe('1.0.0')
    expect(latestAvailable('editorial', code, rows, new Set(['id-1.1.0']))?.version).toBe('1.1.0')
    expect(latestAvailable('editorial', code, [row('1.0.0', { releasedAt: t }), row('1.1.0', { releasedAt: t })], new Set())?.version).toBe('1.1.0')
    expect(latestAvailable('editorial', code, [], new Set())).toBeNull()
    expect([...withdrawnKeys([row('1.1.0', { withdrawnAt: t }), row('1.0.0')])]).toEqual(['editorial@1.1.0'])
  })
  it('live: the newest publish whose version is not withdrawn; the baseline can never be pulled', () => {
    const pubs = [{ id: 3, themeKey: 'editorial', themeVersion: '1.1.0' }, { id: 2, themeKey: 'bazaar', themeVersion: '1.0.0' }, { id: 1, themeKey: 'classic', themeVersion: '1.0.0' }]
    expect(liveOf(pubs, new Set())?.id).toBe(3)
    expect(liveOf(pubs, new Set(['editorial@1.1.0']))?.id).toBe(2)
    expect(liveOf(pubs, new Set(['editorial@1.1.0', 'bazaar@1.0.0']))?.id).toBe(1)
    expect(liveOf([], new Set())).toBeNull()
    expect([isBaseline('classic', '1.0.0'), isBaseline('editorial', '1.0.0')]).toEqual([true, false])
  })
  it('a version earlier than a released one, or one not in the build, cannot be released', () => {
    expect(releaseProblems(CATALOGUE.editorial!['1.1.0']!, ['1.0.0'])).toEqual([])
    expect(releaseProblems(CATALOGUE.editorial!['1.0.0']!, ['1.1.0'])).toHaveLength(1)
    expect(releaseProblems(null, [])).toHaveLength(1)
  })
})
