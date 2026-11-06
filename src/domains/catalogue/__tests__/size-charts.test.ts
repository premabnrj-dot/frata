import { describe, expect, it } from 'vitest'
import { cleanChart, inches, presetsFor, PRESETS } from '../size-charts'

describe('size charts', () => {
  it('starting charts follow what the shop sells; One size always there', () => {
    expect(presetsFor(['ethnic', 'women']).map((p) => p.name)).toEqual(['Kurta set · Women', 'One size'])
    expect(presetsFor([]).map((p) => p.name)).toEqual(['Kurta set · Women', 'Shirt · Men', 'One size'])
  })
  it('every preset is a valid chart', () => {
    for (const p of Object.values(PRESETS)) expect(cleanChart(p.chart).ok, p.name).toBe(true)
  })
  it('refuses a repeated size and silly numbers; derives inches', () => {
    expect(cleanChart({ columns: ['Bust'], rows: [{ size: 'M', values: [91] }, { size: 'm', values: [92] }], howToMeasure: '' }).ok).toBe(false)
    expect(cleanChart({ columns: ['Bust'], rows: [{ size: 'M', values: [910] }], howToMeasure: '' }).ok).toBe(false)
    expect(inches(86)).toBe('33.9')
  })
})
