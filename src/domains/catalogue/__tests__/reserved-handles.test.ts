// Addresses Frrata's own pages use under /products/ (impact review PI·2): every static folder beside a product's
// [handle] page, in the console and in the shop, is in RESERVED_HANDLES — a new page added there without its address
// here fails this test. A product's address typed by hand is refused when it is one; one made from a name is not
// (freeHandles gives it "-2": photos.int.test.ts).
import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cleanProduct, type ProductInput } from '../product-form'
import { RESERVED_HANDLES } from '../variants'

const ROOT = new URL('../../../../', import.meta.url)
const FOLDERS = ['src/app/(console)/console/products/', 'src/app/s/[host]/(shop)/products/']
const base: ProductInput = { title: 'Photos', description: '', typeId: null, modelHeight: '', modelSize: '', options: [], variants: [{ values: [], price: '999', compareAt: '', cost: '', stock: '1', sku: '' }] }

describe('reserved product addresses', () => {
  it('every static page folder under /products/ is reserved', () => {
    const pages = FOLDERS.flatMap((f) => readdirSync(new URL(f, ROOT), { withFileTypes: true })
      .filter((d) => d.isDirectory() && !/^[[(_@]/.test(d.name)).map((d) => d.name))
    expect(pages.length).toBeGreaterThan(3)
    expect(pages.filter((p) => !RESERVED_HANDLES.includes(p))).toEqual([])
  })
  it('one typed by hand is refused; one made from the name is left to freeHandles', () => {
    for (const h of RESERVED_HANDLES) {
      const r = cleanProduct({ ...base, handle: h }, new Date())
      expect(!r.ok && r.errors.handle).toBe('Frrata uses that address. Choose another.')
    }
    const named = cleanProduct(base, new Date())
    expect(named.ok && named.product.handle).toBe('photos')
  })
})
