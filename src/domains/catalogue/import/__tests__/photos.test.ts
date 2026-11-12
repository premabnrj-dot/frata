// Photos by file name (plan 2026-11-12-product-import PI·2 · 8): the names a phone or a photographer gives, matched to
// a shop's products by SKU, address or name, with a trailing number for the order and a colour for a colour photo;
// a name that fits two products, or none, asks "Which product?".
import { describe, expect, it } from 'vitest'
import { exampleNames, findProducts, matchPhoto, MAX_PHOTOS_PER_PRODUCT, photoIndex, placePhotos, stemOf, type PhotoTarget } from '../photos'

const P = (id: string, title: string, handle: string, skus: [string, string | null][] = [], colours: string[] = []): PhotoTarget =>
  ({ id, title, handle, skus: skus.map(([sku, colour]) => ({ sku, colour })), colours, photos: 0 })

const SHOP = [
  P('linen', 'Linen Kurta', 'linen-kurta', [['KS-LINKUR-S-RED', 'Red'], ['KS-LINKUR-M', null], ['KS-LINKUR-L-IND', 'Indigo']], ['Red', 'Indigo', 'Sky Blue']),
  P('anr', 'Anarkali kurta set', 'anarkali-kurta-set', [['KS-ANR-S', null], ['KS-ANR-M', null]]),
  P('chanderi', 'चंदेरी दुपट्टा', 'chanderi-dupatta', [['KS-CHD-FS', null]], ['Rani', 'Haldi']),
  P('chanderi-kurta', 'Chanderi kurta', 'chanderi-kurta', [['KS-CHK-M', null]]),
  P('block', 'Block print kurta', 'block-print-kurta', [['KS-BPK-M', null]]),
  P('ajrakh1', 'Ajrakh stole', 'ajrakh-stole'),
  P('ajrakh2', 'Ajrakh stole', 'ajrakh-stole-2'),
]
const idx = photoIndex(SHOP)
const m = (name: string) => matchPhoto(name, idx)

describe('a file name', () => {
  it('loses its extension and a trailing number of one or two digits', () => {
    expect(stemOf('KS-LINKUR-M-2.jpg')).toEqual({ whole: 'KS-LINKUR-M-2', base: 'KS-LINKUR-M', n: 2 })
    expect(stemOf('Linen Kurta (3).jpeg')).toEqual({ whole: 'Linen Kurta (3)', base: 'Linen Kurta', n: 3 })
    expect(stemOf('linen_kurta_12.png')).toMatchObject({ base: 'linen_kurta', n: 12 })
    expect(stemOf('IMG_4021.jpg')).toEqual({ whole: 'IMG_4021', base: 'IMG_4021', n: null })
    expect(stemOf('kurta.HEIC')).toEqual({ whole: 'kurta', base: 'kurta', n: null })
  })
})

describe('matching a photo to a product', () => {
  it('by SKU: the size, then its place; a colour size makes it that colour\'s photo', () => {
    expect(m('KS-LINKUR-M-2.jpg')).toEqual({ productId: 'linen', n: 2, colour: null, by: 'sku' })
    expect(m('ks-linkur-s-red.jpg')).toEqual({ productId: 'linen', n: null, colour: 'Red', by: 'sku' })
    expect(m('KS-LINKUR-L-IND_1.webp')).toEqual({ productId: 'linen', n: 1, colour: 'Indigo', by: 'sku' })
  })
  it('by the start of a product\'s SKUs, when no other product\'s SKU starts so', () => {
    expect(m('KS-ANR-1.jpg')).toEqual({ productId: 'anr', n: 1, colour: null, by: 'sku' })
    expect(m('KS-LINKUR.jpg')).toMatchObject({ productId: 'linen', colour: null })
  })
  it('by address and by name', () => {
    expect(m('anarkali-kurta-set-2.jpg')).toEqual({ productId: 'anr', n: 2, colour: null, by: 'address' })
    expect(m('Linen Kurta (3).jpeg')).toEqual({ productId: 'linen', n: 3, colour: null, by: 'address' })
    expect(m('Block Print Kurta.jpg')).toMatchObject({ productId: 'block', n: null })
  })
  it('a colour word in the name makes it that colour\'s photo', () => {
    expect(m('linen-kurta-red-1.HEIC')).toEqual({ productId: 'linen', n: 1, colour: 'Red', by: 'name' })
    expect(m('Linen Kurta Sky Blue 2.jpg')).toEqual({ productId: 'linen', n: 2, colour: 'Sky Blue', by: 'name' })
    expect(m('chanderi-rani.jpg')).toEqual({ productId: 'chanderi', n: null, colour: 'Rani', by: 'name' })
  })
  it('a Hindi name is written in Latin letters, as the product\'s address was', () => {
    expect(m('चंदेरी दुपट्टा (2).jpg')).toMatchObject({ productId: 'chanderi', n: 2 })
    expect(m('चंदेरी दुपट्टा हल्दी.jpg')).toMatchObject({ productId: 'chanderi', colour: 'Haldi' })
  })
  it('the words of one product\'s name, in any order', () => {
    expect(m('anarkali-set-3.jpg')).toMatchObject({ productId: 'anr', n: 3 })
    expect(m('print block.jpg')).toMatchObject({ productId: 'block' })
  })
  it('a number that is part of the address stays part of it', () => {
    expect(m('KS-CHD-FS.jpg')).toMatchObject({ productId: 'chanderi', n: null })
  })
  it('every colour is tried, and a name exact once its colour is out wins over a loose fit', () => {
    const saris = photoIndex([P('red', 'Red Sari', 'red-sari', [], ['Red', 'Blue']), P('blue', 'Blue Sari', 'blue-sari', [], ['Red', 'Blue'])])
    expect(matchPhoto('red-sari-blue.jpg', saris)).toEqual({ productId: 'red', n: null, colour: 'Blue', by: 'name' })
    expect(matchPhoto('blue sari red 2.jpg', saris)).toEqual({ productId: 'blue', n: 2, colour: 'Red', by: 'name' })
  })
  it('a whole SKU before a SKU\'s start; "_" and spaces read as "-"', () => {
    const jeans = photoIndex([P('jeans', 'Slim jeans', 'slim-jeans', [['KS-JNS-32', null], ['KS-JNS-34', null]]), ...SHOP])
    expect(matchPhoto('KS-JNS-32.jpg', jeans)).toEqual({ productId: 'jeans', n: null, colour: null, by: 'sku' })
    expect(matchPhoto('KS_ANR_M.jpg', jeans)).toEqual({ productId: 'anr', n: null, colour: null, by: 'sku' })
    expect(matchPhoto('ks linkur s red 2.jpg', jeans)).toEqual({ productId: 'linen', n: 2, colour: 'Red', by: 'sku' })
  })
  it('a number that makes the whole stem another product\'s address or SKU asks with both', () => {
    const two = photoIndex([P('k1', 'Kurta', 'kurta', [['KS-1', null]]), P('k2', 'Kurta', 'kurta-2', [['KS-1-2', null]]), P('dup', 'Dupatta', 'dupatta')])
    expect(matchPhoto('kurta-2.jpg', two)).toMatchObject({ productId: null, n: 2, candidates: ['k1', 'k2'] })
    expect(matchPhoto('KS-1-2.jpg', two)).toMatchObject({ productId: null, n: 2, candidates: ['k1', 'k2'] })
    expect(matchPhoto('dupatta-2.jpg', two)).toEqual({ productId: 'dup', n: 2, colour: null, by: 'address' })
  })
  it('no match asks with nothing to suggest', () => {
    expect(m('IMG_4021.jpg')).toEqual({ productId: null, n: null, colour: null, by: null, candidates: [] })
    expect(m('2.jpg')).toMatchObject({ productId: null })
    expect(m('kurta-of-the-week.jpg')).toMatchObject({ productId: null })
  })
  it('two products equally likely asks, naming both', () => {
    expect(m('chanderi-1.jpg')).toEqual({ productId: null, n: 1, colour: null, by: null, candidates: ['chanderi', 'chanderi-kurta'] })
    expect(m('Ajrakh Stole.jpg')).toMatchObject({ productId: null, candidates: ['ajrakh1', 'ajrakh2'] })
    expect(m('ajrakh-stole-2.jpg')).toMatchObject({ productId: null, n: 2, candidates: ['ajrakh1', 'ajrakh2'] })
    expect(m('kurta.jpg')).toMatchObject({ productId: null, candidates: [] })
    // A shop's SKU prefix names every product: too many to suggest.
    expect(m('KS-3.jpg')).toMatchObject({ productId: null, candidates: [] })
  })
})

describe('placing photos', () => {
  const at = (items: { key: string; productId: string | null; n: number | null; name: string }[], have = 0) =>
    Object.fromEntries([...placePhotos(items, () => have)].map(([k, v]) => [k, v]))
  it('by their number, then their names as a person reads them', () => {
    expect(at([
      { key: 'a', productId: 'p', n: 2, name: 'p-2.jpg' }, { key: 'b', productId: 'p', n: 1, name: 'p-1.jpg' },
      { key: 'c', productId: 'p', n: null, name: 'p back 10.jpg' }, { key: 'd', productId: 'p', n: null, name: 'p back 9.jpg' },
      { key: 'e', productId: null, n: 1, name: 'IMG_1.jpg' },
    ])).toEqual({ b: { i: 1, of: 4, over: false }, a: { i: 2, of: 4, over: false }, d: { i: 3, of: 4, over: false }, c: { i: 4, of: 4, over: false } })
  })
  it(`at most ${MAX_PHOTOS_PER_PRODUCT} photos a product, counting the ones it has`, () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ key: String(i), productId: 'p', n: i + 1, name: `p-${i + 1}.jpg` }))
    expect(Object.values(at(many, 7)).map((p) => p.over)).toEqual([false, false, false, true, true])
  })
})

describe('"Which product?"', () => {
  it('finds by the start of any word, or by SKU', () => {
    expect(findProducts('kur', idx).map((t) => t.id)).toEqual(['anr', 'block', 'chanderi-kurta', 'linen'])
    expect(findProducts('ks-bp', idx).map((t) => t.id)).toEqual(['block'])
    expect(findProducts('चंदेरी', idx).map((t) => t.id)).toEqual(['chanderi-kurta', 'chanderi'])
    expect(findProducts('  ', idx)).toEqual([])
  })
})

describe('the example names', () => {
  it('a product\'s SKUs\' start and its address', () => {
    expect(exampleNames(SHOP[1])).toEqual(['KS-ANR-1.jpg', 'anarkali-kurta-set-2.jpg'])
    expect(exampleNames(SHOP[5])).toEqual(['ajrakh-stole-2.jpg'])
  })
})
