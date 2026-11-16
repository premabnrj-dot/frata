import { describe, expect, it } from 'vitest'
import { acceptedBrandFile, rasterBase, renditionPath, svgPath } from '../files'

const t = '11111111-1111-1111-1111-111111111111', other = '22222222-2222-2222-2222-222222222222', host = 'abc.public.blob.vercel-storage.com'
const uuid = '33333333-3333-3333-3333-333333333333', sha = 'cd'.repeat(32)

describe('a brand file', () => {
  it('accepts this store’s raster logo at 400 px and its cleaned SVG, exactly', () => {
    expect(acceptedBrandFile(`https://${host}/tenants/${t}/brand/${uuid}-400.webp`, host, t)).toEqual({ url: `https://${host}/tenants/${t}/brand/${uuid}-400.webp`, kind: 'raster' })
    expect(acceptedBrandFile(`https://${host}/tenants/${t}/brand/${uuid}-400.jpg`, host, t)?.kind).toBe('raster')
    expect(acceptedBrandFile(`https://${host}/${svgPath(t, sha)}`, host, t)?.kind).toBe('svg')
  })
  it.each([
    [`https://${host}/tenants/${other}/brand/${uuid}-400.webp`], [`https://${host}/tenants/${t}/products/${uuid}-400.webp`], [`https://${host}/tenants/${t}/brand/${uuid}-800.webp`],
    [`https://evil.test/tenants/${t}/brand/${uuid}-400.webp`], [`http://${host}/tenants/${t}/brand/${uuid}-400.webp`], [`https://${host}/tenants/${t}/brand/${sha}.svg?x`],
    [`https://${host}/tenants/${t}/brand/../brand/${sha}.svg`], [`https://${host}/tenants/${t}/brand/${sha.slice(1)}.svg`], [`https://${host}/${renditionPath(t, sha)}`], [42],
  ])('refuses %s', (u) => { expect(acceptedBrandFile(u, host, t)).toBeNull() })
  it('finds a raster logo’s photo base', () => {
    expect(rasterBase(`https://${host}/tenants/${t}/brand/${uuid}-400.webp`)).toBe(`https://${host}/tenants/${t}/brand/${uuid}`)
    expect(rasterBase(`https://${host}/tenants/${t}/brand/${uuid}-400.jpg`)).toBe(`https://${host}/tenants/${t}/brand/${uuid}.jpg`)
  })
})
