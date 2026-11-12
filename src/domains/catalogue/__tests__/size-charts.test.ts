import { describe, expect, it } from 'vitest'
import { cleanChart, inches, presetsFor, PRESETS, chartFromText, sizeKey } from '../size-charts'

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

describe('a chart edited as text (PR·0: 23.5 became 235)', () => {
  const d = (values: string[]) => ({ columns: ['Foot length'], howToMeasure: '', rows: [{ size: 'UK 6', values }] })
  it('keeps decimals, blanks are none, anything else is named', () => {
    expect(chartFromText(d(['23.5']))).toMatchObject({ rows: [{ size: 'UK 6', values: [23.5] }] })
    expect(chartFromText(d(['']))).toMatchObject({ rows: [{ values: [null] }] })
    expect(chartFromText(d(['23.'])) ).toBe('UK 6: 23. is not a number of cm.')
    expect(chartFromText(d(['23.555']))).toBe('UK 6: 23.555 is not a number of cm.')
  })
  it('a size however it is typed', () => expect(sizeKey('2-3 y')).toBe(sizeKey('2–3 Y')))
})

