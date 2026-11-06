import { describe, expect, it } from 'vitest'
import { emailTypo, orderPrefix, slugFor, slugProblem } from '../slug'

describe('slugFor', () => {
  it('turns a shop name into an address', () => {
    expect(slugFor('Kesar Studio')).toBe('kesar-studio')
    expect(slugFor('Kesar & Co.')).toBe('kesar-and-co')
    expect(slugFor('  Café  Noir  ')).toBe('cafe-noir')
  })
  it('drops letters outside a–z, leaving the rest for the merchant to type', () => {
    expect(slugFor('केसर')).toBe('')
    expect(slugFor('केसर Studio ✨')).toBe('studio')
  })
  it('keeps to 30 characters without a trailing hyphen', () => {
    const s = slugFor('The Very Long Name Of A Handloom Label From Indore')
    expect(s.length).toBeLessThanOrEqual(30)
    expect(s.endsWith('-')).toBe(false)
  })
})

describe('slugProblem', () => {
  it('accepts a normal address', () => expect(slugProblem('kesar-studio')).toBeNull())
  it('refuses short, badly shaped and reserved addresses', () => {
    expect(slugProblem('ks')).toBe('too_short')
    expect(slugProblem('-kesar')).toBe('shape')
    expect(slugProblem('kesar--studio')).toBe('shape')
    expect(slugProblem('Kesar')).toBe('shape')
    expect(slugProblem('admin')).toBe('reserved')
    expect(slugProblem('frata')).toBe('reserved')
  })
})

describe('orderPrefix', () => {
  it('uses the merchant prefix when set, else two letters of the name', () => {
    expect(orderPrefix('kesar', 'Kesar Studio')).toBe('KESAR')
    expect(orderPrefix('', 'Kesar Studio')).toBe('KE')
    expect(orderPrefix('', 'केसर')).toBe('OR')
  })
})

describe('emailTypo', () => {
  it('suggests the common fix', () => {
    expect(emailTypo('riya@gmial.com')).toBe('riya@gmail.com')
    expect(emailTypo('Riya@GMAI.com')).toBe('Riya@gmail.com')
  })
  it('stays quiet when nothing looks wrong', () => {
    expect(emailTypo('riya@kesarstudio.in')).toBeNull()
    expect(emailTypo('not-an-email')).toBeNull()
  })
})
