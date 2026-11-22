import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// site-fonts.ts calls next/font, which only runs inside Next: read its letters as text.
const LETTERS = /MUKTA_LETTERS = '([^']+)'/.exec(readFileSync('src/components/brand/site-fonts.ts', 'utf8'))?.[1] ?? ''

describe('the website’s Hindi face', () => {
  it('holds every Devanagari letter the homepage shows', () => {
    const page = readFileSync('src/app/page.tsx', 'utf8')
    const used = new Set(page.match(/[ऀ-ॿ]/g) ?? [])
    const missing = [...used].filter((c) => !LETTERS.includes(c))
    expect(missing, 'add them to MUKTA_LETTERS and re-cut the file (src/components/brand/site-fonts.ts)').toEqual([])
  })
})
