import { describe, expect, it } from 'vitest'
import { zoneCounts } from '../counts'
import type { Zone } from '../resolve'

const z = (id: string, position: number, preset: Zone['preset']): Zone =>
  ({ id, name: id, position, preset, charge: 0, freeAbove: null, daysMin: 1, daysMax: 2, codOn: true, codCharge: 0, codMin: 0, codMax: null })

describe('zoneCounts', () => {
  it('each directory code counted once, in the zone THE rule picks', () => {
    const zones = [z('metro', 0, 'metro'), z('rest', 1, 'rest'), z('jaipur', 2, null)]
    const dir = ['110001', '400070', '302001', '302012', '845401']
    const c = zoneCounts(dir, zones, new Map([['302', 'jaipur'], ['110001', 'jaipur']]))
    expect(Object.fromEntries(c)).toEqual({ metro: 1, rest: 1, jaipur: 3 })
  })
  it('no zones: nothing', () => expect(zoneCounts(['110001'], [], new Map()).size).toBe(0))
})
