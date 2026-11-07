import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HEX, THREAD, WORD } from '../mark-paths'

const css = readFileSync('src/app/globals.css', 'utf8')
const light = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')))
const token = (name: string) => light.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1]?.toUpperCase()

describe('the frrata mark', () => {
  it("the generated icons' colours are the tokens' (an image cannot read CSS, so they are copied once and held here)", () => {
    expect(HEX.rani.toUpperCase()).toBe(token('brand'))
    expect(HEX.ink.toUpperCase()).toBe(token('primary'))
    expect(HEX.paper.toUpperCase()).toBe(token('primary-foreground'))
  })
  it('the thread stops a stitch short of the second r (3 units before its stem edge at x 89)', () => {
    expect(THREAD.endsWith('H86')).toBe(true)
    expect(WORD).toContain('M96 100 V46')
  })
})
