// =============================================================================
// FILE: src/domains/catalogue/import/fields.ts
//
// A SHEET'S COLUMNS → WHAT FRRATA STORES (plan 2026-11-12-product-import PI·1 · 4). Pure: the browser matches a file's
// headers here, and the server reads each chunk with the mapping the job stored, through the same tables.
//
// Rules:
// - A header is matched by its words, case and punctuation aside: ours (the template), Shopify's product CSV,
//   WooCommerce's export, and the words Indian sheets use (Item, MRP, Qty, Rate, Purchase price).
// - Each field takes at most one column, the first that names it. Everything else is "Not imported", listed.
// - "MRP" is the price when the sheet has no other price column, and the M.R.P. (compare-at) when it has one.
// - A WooCommerce file is told by its own columns (Attribute 1 name, Parent, Regular price): only there does "Type"
//   mean simple / variable / variation, and "ID" a row's id. Shopify's "Type" is its product type: not imported.
// - Cost is a field only for a member who sees costs (seesCosts, ADR-0003); for anyone else the column is not imported.
// =============================================================================

export const FIELDS = {
  handle: 'Address', title: 'Product name', description: 'Description',
  size: 'Sizes', colour: 'Colours',
  option1Name: 'Option 1 name', option1Value: 'Option 1 value', option2Name: 'Option 2 name', option2Value: 'Option 2 value',
  option3Name: 'Option 3 name', option3Value: 'Option 3 value',
  sku: 'SKU', price: 'Price', sale: 'Sale price', compareAt: 'M.R.P.', cost: 'Cost', stock: 'Stock', barcode: 'Barcode',
  hsn: 'HSN code', gst: 'GST rate', tags: 'Tags',
  rowId: 'Row ID', parent: 'Parent', kind: 'Row type',
} as const
export type Field = keyof typeof FIELDS
export const FIELD_KEYS = Object.keys(FIELDS) as Field[]

export const SOURCES = ['shopify', 'woocommerce', 'sheet'] as const
export type Source = (typeof SOURCES)[number]

/** What a job stores and every chunk is read with: the file's headers and the field chosen for each (null: not imported). */
export type Mapping = { source: Source; headers: string[]; fields: (Field | null)[] }

/** A header in plain words: "Variant Compare At Price" → "variant compare at price", "M.R.P." → "mrp", "Attribute 1 value(s)" → "attribute 1 value s". */
export const words = (h: string) => h.normalize('NFKC').toLowerCase().replace(/\./g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

const ALIASES: Record<Exclude<Field, 'rowId' | 'parent' | 'kind'>, string[]> = {
  handle: ['handle', 'url handle', 'product handle', 'slug', 'address'],
  title: ['title', 'name', 'product name', 'product', 'item', 'item name', 'product title', 'style name', 'design name', 'design'],
  description: ['body html', 'description', 'product description', 'details', 'about'],
  size: ['size', 'sizes', 'available sizes'],
  colour: ['colour', 'color', 'colours', 'colors', 'shade', 'shades'],
  option1Name: ['option1 name', 'option 1 name', 'attribute 1 name'],
  option1Value: ['option1 value', 'option 1 value', 'attribute 1 value s', 'attribute 1 values', 'attribute 1 value'],
  option2Name: ['option2 name', 'option 2 name', 'attribute 2 name'],
  option2Value: ['option2 value', 'option 2 value', 'attribute 2 value s', 'attribute 2 values', 'attribute 2 value'],
  option3Name: ['option3 name', 'option 3 name', 'attribute 3 name'],
  option3Value: ['option3 value', 'option 3 value', 'attribute 3 value s', 'attribute 3 values', 'attribute 3 value'],
  sku: ['sku', 'variant sku', 'item code', 'style code', 'product code', 'article', 'article no', 'sku code'],
  price: ['price', 'variant price', 'regular price', 'selling price', 'sale rate', 'rate', 'sp', 'price inr', 'price rs'],
  sale: ['sale price'],
  compareAt: ['compare at price', 'variant compare at price', 'compare at', 'list price', 'mrp', 'mrp inr', 'mrp rs'],
  cost: ['cost', 'cost per item', 'purchase price', 'buying price', 'cost price', 'cp', 'purchase rate'],
  stock: ['stock', 'qty', 'quantity', 'inventory', 'variant inventory qty', 'inventory quantity', 'stock quantity', 'units', 'pcs', 'in stock qty'],
  barcode: ['barcode', 'variant barcode', 'gtin', 'ean', 'upc', 'gtin upc ean or isbn', 'gtin upc ean isbn'],
  hsn: ['hsn', 'hsn code', 'hsn sac', 'hsn sac code'],
  gst: ['gst', 'gst rate', 'gst percent', 'gst %', 'tax rate', 'gst slab'],
  tags: ['tags', 'tag', 'keywords'],
}
const WOO_ONLY: Partial<Record<Field, string[]>> = { rowId: ['id'], parent: ['parent'], kind: ['type'] }

/** Which platform made the file, by its own columns. */
export function sourceOf(headers: readonly string[]): Source {
  const w = new Set(headers.map(words))
  if (w.has('attribute 1 name') || (w.has('parent') && w.has('regular price'))) return 'woocommerce'
  if (w.has('handle') && (w.has('variant sku') || w.has('option1 name') || w.has('body html'))) return 'shopify'
  return 'sheet'
}

/**
 * Each column's field, by its header. `costs`: whether the member sees costs (a cost column is otherwise not imported).
 * With no other price column, "MRP" is the price (an Indian sheet's one price is its M.R.P.).
 */
export function matchColumns(headers: readonly string[], opts: { costs: boolean }): Mapping {
  const source = sourceOf(headers)
  const table: [Field, string[]][] = [...Object.entries(ALIASES), ...(source === 'woocommerce' ? Object.entries(WOO_ONLY) : [])] as [Field, string[]][]
  const taken = new Set<Field>()
  const fields = headers.map((h): Field | null => {
    const w = words(h)
    if (!w) return null
    const hit = table.find(([f, names]) => !taken.has(f) && names.includes(w))
    if (!hit || (hit[0] === 'cost' && !opts.costs)) return null
    taken.add(hit[0])
    return hit[0]
  })
  // One price column only, and it says MRP: that is the price.
  if (!taken.has('price')) {
    const mrp = fields.indexOf('compareAt')
    if (mrp >= 0 && /^mrp/.test(words(headers[mrp]!))) fields[mrp] = 'price'
  }
  return { source, headers: [...headers], fields }
}

/** A mapping as the member changed it: one column per field (a field chosen twice keeps the later column), cost only for who sees it. */
export function remap(m: Mapping, column: number, field: Field | null, opts: { costs: boolean }): Mapping {
  if (field === 'cost' && !opts.costs) return m
  const fields = m.fields.map((f, i) => (i === column ? field : f === field ? null : f))
  return { ...m, fields }
}

/** A stored mapping is used again only for a file with exactly its headers (the shop's last import from that source). */
export const sameHeaders = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((h, i) => words(h) === words(b[i]!))
