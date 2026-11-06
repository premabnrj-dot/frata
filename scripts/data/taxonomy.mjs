#!/usr/bin/env node
// Builds src/domains/catalogue/taxonomy/apparel.json from a Shopify product
// taxonomy release (github.com/Shopify/product-taxonomy, MIT licence): the
// fashion part only (clothing, clothing accessories, shoes, jewellery,
// handbags), with each category's attributes, their standard values, and
// the Google category it maps to. Adopting a new release is a deliberate
// commit: download its dist/en files, run this, read the diff.
//   node scripts/data/taxonomy.mjs <dir with categories.json attributes.json all_mappings.json> <tag>
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [dir, tag] = process.argv.slice(2)
if (!dir || !tag) { console.error('usage: taxonomy.mjs <dir> <tag>'); process.exit(1) }
const read = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'))
const cats = read('categories.json'), attrs = read('attributes.json'), maps = read('mappings.json')
const ROOTS = ['aa-1', 'aa-2', 'aa-5', 'aa-6', 'aa-8']
const short = (gid) => gid.split('/').pop()
const inScope = (id) => ROOTS.some((r) => id === r || id.startsWith(r + '-'))

const google = {}
for (const m of maps.mappings) {
  if (!String(m.output_taxonomy).startsWith('google/')) continue
  for (const r of m.rules) google[short(r.input.category.id)] = Number(r.output.category[0].id)
}
const byHandle = Object.fromEntries(attrs.attributes.map((a) => [a.handle, a]))
const categories = []
const used = new Set()
for (const v of cats.verticals) for (const c of v.categories) {
  const id = short(c.id)
  if (!inScope(id)) continue
  const handles = (c.attributes ?? []).map((a) => a.handle).filter((h) => byHandle[h])
  handles.forEach((h) => used.add(h))
  categories.push([id, c.name, c.parent_id ? short(c.parent_id) : null, c.full_name.replace(/^Apparel & Accessories > /, ''), handles, google[id] ?? null])
}
const attributes = {}
for (const h of [...used].sort()) {
  const a = byHandle[h]
  attributes[h] = [a.name, (a.values ?? []).map((x) => [short(x.id), x.name])]
}
const out = { source: 'Shopify product taxonomy (MIT), github.com/Shopify/product-taxonomy', tag, fileVersion: cats.version, googleTaxonomy: '2021-09-21', categories, attributes }
writeFileSync('src/domains/catalogue/taxonomy/apparel.json', JSON.stringify(out))
console.log(`taxonomy ${tag}: ${categories.length} categories, ${used.size} attributes, ${Object.values(attributes).reduce((n, a) => n + a[1].length, 0)} values`)
