import { describe, expect, it } from 'vitest'
import { contentDisposition, documentFileName, paperAccent, PAPER } from '../paper'

describe('paper rules (Documents D0)', () => {
  it('keeps a shop colour that reads on white, else ink', () => {
    expect(paperAccent('#8A3B1F')).toBe('#8A3B1F')
    expect(paperAccent('#F2B233')).toBe(PAPER.ink)
    expect(paperAccent(null)).toBe(PAPER.ink)
    expect(paperAccent('red')).toBe(PAPER.ink)
  })
  it('names a file for what it is, without a slash', () => {
    expect(documentFileName('invoice', 'Kesar Studio', ['KS/26-27/00001'], '2026-11-08')).toBe('Kesar Studio Tax invoice KS-26-27-00001.pdf')
    expect(documentFileName('invoice', 'Kesar Studio', ['KS/26-27/B0001'], '2026-11-08', 'Bill of supply')).toBe('Kesar Studio Bill of supply KS-26-27-B0001.pdf')
    expect(documentFileName('slip', 'Kesar Studio', ['KS-1', 'KS-2'], '2026-11-08')).toBe('Kesar Studio Packing slips 2026-11-08 (2).pdf')
  })
  it('gives an ASCII name and the real one for a Hindi shop name', () => {
    const d = contentDisposition('केसर Tax invoice KS-1.pdf')
    expect(d).toMatch(/^attachment; filename="Tax invoice KS-1.pdf"; filename\*=UTF-8''%E0%A4/)
  })
})
