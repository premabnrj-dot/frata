import { describe, expect, it } from 'vitest'
import { acceptedBase, PATH_SHAPE, pick, srcSet, storeHost, widthsFor } from '../sizes'

describe('photo sizes', () => {
  it('never makes a photo larger than it is', () => {
    expect(widthsFor(4000)).toEqual([400, 800, 1200, 1600])
    expect(widthsFor(1000)).toEqual([400, 800])
    expect(widthsFor(300)).toEqual([400])
  })
  it('srcset and pick', () => {
    expect(srcSet('https://x/a', [400, 800])).toBe('https://x/a-400.webp 400w, https://x/a-800.webp 800w')
    expect(pick([400, 800, 1200], 700)).toBe(800)
    expect(pick([400, 800], 2000)).toBe(800)
  })
  it('accepts only paths inside a shop folder', () => {
    const t = '11111111-1111-1111-1111-111111111111', id = '22222222-2222-2222-2222-222222222222'
    expect(PATH_SHAPE.exec(`tenants/${t}/products/${id}-800.webp`)?.[1]).toBe(t)
    expect(PATH_SHAPE.test(`tenants/${t}/../x/${id}-800.webp`)).toBe(false)
    expect(PATH_SHAPE.test(`tenants/${t}/products/${id}-801.webp`)).toBe(false)
  })
})

describe('acceptedBase', () => {
  const host = storeHost('store_ROPY6FWygQEZwHrb')!
  const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222', id = '33333333-3333-3333-3333-333333333333'
  const ok = `https://${host}/tenants/A/products/${id}`.replace('/A/', `/${A}/`)
  it('derives the store host', () => expect(host).toBe('ropy6fwygqezwhrb.public.blob.vercel-storage.com'))
  it('accepts exactly our store, this tenant, this folder', () => expect(acceptedBase(ok, host, A, 'products')).toBe(ok))
  it('refuses another tenant, folder or store', () => {
    expect(acceptedBase(ok, host, B, 'products')).toBeNull()
    expect(acceptedBase(ok, host, A, 'brand')).toBeNull()
    expect(acceptedBase(ok.replace(host, 'evil.public.blob.vercel-storage.com'), host, A, 'products')).toBeNull()
  })
  it('a look\'s photo: this shop\'s theme folder only; another shop\'s theme photo is refused', () => {
    const t = ok.replace('/products/', '/theme/')
    expect(acceptedBase(t, host, A, 'theme')).toBe(t)
    expect(acceptedBase(t.replace(A, B), host, A, 'theme')).toBeNull()
    expect(acceptedBase(ok, host, A, 'theme')).toBeNull()
  })
  it('refuses strings a URL parser would clean up into a passing path', () => {
    for (const bad of [
      `https://${host}/tenants/${B}/products/x\\..\\..\\..\\${A}/products/${id}`,
      `https://${host}/tenants/${B}/products/%2e%2e/%2e%2e/%2e%2e/tenants/${A}/products/${id}`,
      `${ok}?z`, `${ok}#frag`, `https://${host}/tenants/${B}/../tenants/${A}/products/${id}`, `http://${host}/tenants/${A}/products/${id}`,
    ]) expect(acceptedBase(bad, host, A, 'products'), bad).toBeNull()
  })
})

describe('logo for paper (Documents D2)', () => {
  const t = '11111111-1111-1111-1111-111111111111', id = '22222222-2222-2222-2222-222222222222', host = 'abc.public.blob.vercel-storage.com'
  it('accepts only this shop’s documents folder, PNG, exact URL', async () => {
    const { acceptedDocLogo, DOC_LOGO_SHAPE } = await import('../sizes')
    expect(DOC_LOGO_SHAPE.exec(`tenants/${t}/documents/${id}.png`)?.[1]).toBe(t)
    expect(DOC_LOGO_SHAPE.test(`tenants/${t}/documents/${id}.webp`)).toBe(false)
    expect(acceptedDocLogo(`https://${host}/tenants/${t}/documents/${id}.png`, host, t)).toBeTruthy()
    expect(acceptedDocLogo(`https://${host}/tenants/${id}/documents/${id}.png`, host, t)).toBeNull()
    expect(acceptedDocLogo(`https://evil.test/tenants/${t}/documents/${id}.png`, host, t)).toBeNull()
    expect(acceptedDocLogo(`https://${host}/tenants/${t}/documents/${id}.png?x=1`, host, t)).toBeNull()
  })
  it('knows PNG and JPEG by their bytes, and a PNG’s size', async () => {
    const { imageKind, pngSize } = await import('../sizes')
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 2, 88, 0, 0, 0, 200])
    expect(imageKind(png)).toBe('png')
    expect(pngSize(png)).toEqual({ width: 600, height: 200 })
    expect(imageKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg')
    expect(imageKind(new TextEncoder().encode('<svg'))).toBeNull()
  })
})
