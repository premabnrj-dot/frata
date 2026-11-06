import { describe, expect, it } from 'vitest'
import { surfaceFor } from '../host'

describe('surfaceFor', () => {
  it('knows the console', () => {
    expect(surfaceFor('app.frata.in', 'app.frata.in')).toEqual({ kind: 'console' })
    expect(surfaceFor('APP.frata.in:443', 'app.frata.in')).toEqual({ kind: 'console' })
  })
  it('treats Vercel aliases as the console', () => {
    expect(surfaceFor('frata-git-main.vercel.app', 'app.frata.in')).toEqual({ kind: 'console' })
  })
  it('treats every other host as a storefront, normalised', () => {
    expect(surfaceFor('Shop.Brand.in.', 'app.frata.in')).toEqual({ kind: 'storefront', host: 'shop.brand.in' })
  })
  it('treats localhost as local', () => {
    expect(surfaceFor('localhost:3000', 'app.frata.in')).toEqual({ kind: 'local' })
    expect(surfaceFor(null, 'app.frata.in')).toEqual({ kind: 'local' })
  })
})
