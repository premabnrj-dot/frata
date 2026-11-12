import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { HEX, STITCH, THREAD, WORD, threadPath } from '../mark-paths'

const css = readFileSync('src/app/base.css', 'utf8')
const LIGHT = ':root, [data-neel] [data-store-theme] {'
const light = css.slice(css.indexOf(LIGHT), css.indexOf('}', css.indexOf(LIGHT)))
const token = (name: string) => light.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1]?.toUpperCase()

describe('the frrata mark', () => {
  it("the generated icons' colours are the tokens' (an image cannot read CSS, so they are copied once and held here)", () => {
    expect(HEX.rani.toUpperCase()).toBe(token('brand'))
    expect(HEX.raniOnInk.toUpperCase()).toBe(token('brand-on-ink'))
    expect(HEX.ink.toUpperCase()).toBe(token('primary'))
    expect(HEX.paper.toUpperCase()).toBe(token('primary-foreground'))
  })
  it('the thread stops a stitch short of the second r at every stroke the mark is drawn with (joined, it reads "nr")', () => {
    expect(THREAD.endsWith('H86')).toBe(true)
    expect(WORD).toContain('M96 100 V46')
    for (const sw of [14, 15, 16, 18]) {
      const end = Number(threadPath(sw).match(/H([\d.]+)$/)![1])
      expect(96 - sw / 2 - end).toBe(STITCH) // the second r's stem edge minus the thread's (butt) end
    }
  })
})
