// =============================================================================
// DEMO CATALOGUE: House Of Ayuda (slug "demo"), 25 pieces across six collections, for testing the shop end to end.
//
// Photos: hand-picked from Pexels (pexels.com/license: free to use and modify, no attribution required; never
// implying the people pictured endorse the shop). Each photo is downloaded, made into the shop's four sizes
// (400/800/1200/1600 webp) and uploaded to the shop's own Blob folder, exactly where the console's uploads go, so
// the shop renders them like any merchant photo. Names, copy, prices and stock are invented for the demo.
//
// Run (from a session whose proxy injects the Blob token for vercel.com):
//   NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt \
//   BLOB_READ_WRITE_TOKEN=vercel_blob_rw_<storeId>_proxy node scripts/demo/house-of-ayuda.mjs > /tmp/ayuda.sql
// then apply the printed SQL to the shop's database (it replaces any earlier run's pieces and collections).
// =============================================================================
import { randomUUID } from 'node:crypto'
import { put } from '@vercel/blob'
import sharp from 'sharp'

const TENANT = '827b6126-b4d2-47eb-877a-6ebc0e612900'
const TYPE = { women: '2a2d091b-1138-4586-85a9-c6458ad76f97', men: 'b61dd778-69dc-40b3-8a9d-8a6a2e99bcdb', one: '672be228-bdc9-483a-a570-7d5027955cbc' }
const CAT = { sari: 'aa-1-23-2-1', lehenga: 'aa-1-23-2-2', kurta: 'aa-1-23-7', suit: 'aa-1-23-10' }
const GENDER = { women: '18', men: '19' }
const FABRIC = { cotton: '16984', silk: '16997', linen: '16989', velvet: '563', satin: '16996', rayon: '22664', chanderi: 'frata:chanderi', banarasi: 'frata:banarasi', mul: 'frata:mul', kota: 'frata:kota' }
const WOMEN_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'], MEN_SIZES = ['S', 'M', 'L', 'XL', 'XXL'], LEHENGA_SIZES = ['S', 'M', 'L']
const rs = (r) => r * 100 // rupees → paise

/** [handle, title, kind, price ₹, compareAt ₹|null, fabric, photo ids (Pexels), occasion, description, tags] */
const PIECES = [
  // Saris (one size, blouse piece included)
  ['crimson-chanderi-sari', 'Crimson Chanderi Sari', 'sari', 6490, null, 'chanderi', [11629757], 'festive', 'Featherlight chanderi in a deep crimson with a soft zari edge. Drapes easily and holds its pleats through a long evening. Comes with an unstitched blouse piece.', ['festive']],
  ['red-border-georgette-sari', 'Red Border Georgette Sari', 'sari', 3290, 3990, 'satin', [20161456], 'party', 'A fluid georgette sari in classic red with a silver-toned border. Easy to drape, easy to travel with. Blouse piece included.', ['sale']],
  ['saffron-silk-sari', 'Saffron Silk Sari', 'sari', 8990, null, 'banarasi', [28943474], 'wedding', 'Banarasi-weave silk in a glowing saffron with a woven pallu. Made for the big day and every family wedding after it. Blouse piece included.', ['wedding']],
  ['gold-tissue-sari', 'Gold Tissue Sari', 'sari', 7490, null, 'silk', [37054322], 'wedding', 'Tissue silk with a gentle shimmer and a contrast border. Catches the light without shouting. Blouse piece included.', ['wedding']],
  ['haldi-cotton-sari', 'Haldi Cotton Sari', 'sari', 1890, null, 'kota', [40290281], 'daily-wear', 'A breathable kota cotton sari in turmeric yellow with a red edge. Soft from the first wash, made for long summer days. Blouse piece included.', ['everyday']],
  ['magenta-handloom-sari', 'Magenta Handloom Sari', 'sari', 4290, null, 'cotton', [7326221], 'festive', 'Handloom cotton in a rich magenta with a woven green pallu. Every piece carries small weaving marks: they are how you know it was made by hand. Blouse piece included.', ['festive']],
  // Lehengas (S/M/L, semi-stitched)
  ['rani-pink-lehenga-set', 'Rani Pink Lehenga Set', 'lehenga', 14990, null, 'silk', [16803130], 'wedding', 'A rani pink lehenga with a woven border, a matching blouse and a contrast dupatta. Semi-stitched waist to fit you.', ['wedding']],
  ['blush-mirror-work-lehenga', 'Blush Mirror-work Lehenga', 'lehenga', 18990, null, 'satin', [33343591], 'wedding', 'Soft blush pink with mirror and thread work across the yoke. Light enough to dance in all night.', ['wedding']],
  ['ivory-chikankari-lehenga', 'Ivory Chikankari Lehenga', 'lehenga', 16490, 19990, 'cotton', [35637857], 'wedding', 'Ivory chikankari on fine cotton, with a sheer dupatta. Day weddings, mehendi mornings, haldi afternoons.', ['wedding', 'sale']],
  ['fuchsia-sequin-lehenga', 'Fuchsia Sequin Lehenga', 'lehenga', 21990, null, 'satin', [37628608, 37628619], 'party', 'Fuchsia net over satin, scattered with tonal sequins. A full flare with a matching dupatta.', ['wedding']],
  // Women's kurta sets and kurtas
  ['indigo-embroidered-kurta-set', 'Indigo Embroidered Kurta Set', 'suit', 4590, null, 'rayon', [29460597], 'festive', 'Deep indigo kurta with tonal embroidery at the yoke, straight pants and a dupatta. Easy festive dressing.', ['festive']],
  ['teal-printed-anarkali-set', 'Teal Printed Anarkali Set', 'suit', 3890, null, 'cotton', [33363057], 'festive', 'A flared anarkali in teal with an all-over print, a matching dupatta and pants. Cotton, so it breathes.', ['festive']],
  ['haldi-silk-kurta-with-dupatta', 'Haldi Silk Kurta with Dupatta', 'suit', 5290, null, 'silk', [33824984], 'festive', 'Turmeric-yellow silk kurta with a zari neckline and a woven dupatta. Made for haldi, worn long after.', ['festive', 'wedding']],
  ['mocha-embroidered-kurta-set', 'Mocha Embroidered Kurta Set', 'suit', 4290, null, 'cotton', [34933671], 'office', 'A mocha kurta with self embroidery, straight pants and a sheer dupatta. Quiet enough for work, special enough for dinner.', ['everyday']],
  ['wine-velvet-kurta-set', 'Wine Velvet Kurta Set', 'suit', 6990, null, 'velvet', [34933700], 'festive', 'Wine velvet with gold embroidery and an organza dupatta. Warm for winter weddings.', ['festive', 'wedding']],
  ['lavender-chikankari-kurta-set', 'Lavender Chikankari Kurta Set', 'suit', 4990, null, 'mul', [36634909], 'festive', 'Lavender mul cotton with hand chikankari, palazzos and a dupatta. Soft, light and endlessly wearable.', ['everyday']],
  ['sage-floral-kurta-set', 'Sage Floral Kurta Set', 'suit', 2790, 3490, 'cotton', [22064201], 'daily-wear', 'Sage green with a printed floral and a long dupatta. A daily kurta set that looks like you tried.', ['everyday', 'sale']],
  ['lemon-chikankari-kurti', 'Lemon Chikankari Kurti', 'kurta-w', 1690, null, 'cotton', [8771006], 'daily-wear', 'A short lemon kurti with chikankari down the front. Pair it with jeans or white pants.', ['everyday']],
  // Men
  ['ivory-embroidered-kurta', 'Ivory Embroidered Kurta', 'kurta-m', 2990, null, 'cotton', [37045884, 40341347], 'festive', 'Ivory cotton kurta with contrast embroidery on the placket. A festive staple that washes well.', ['men', 'festive']],
  ['black-straight-kurta', 'Black Straight Kurta', 'kurta-m', 2490, null, 'cotton', [33785213], 'party', 'A clean black kurta with a band collar. Wear it with white pyjamas or straight with denim.', ['men']],
  ['beige-pathani-set', 'Beige Pathani Set', 'kurta-m', 3490, null, 'linen', [28758558], 'festive', 'A beige linen-blend pathani with matching salwar. Structured shoulders, easy fit.', ['men']],
  ['maroon-short-kurta', 'Maroon Short Kurta', 'kurta-m', 1790, 2290, 'cotton', [26984682], 'daily-wear', 'A hip-length maroon kurta with tonal stitch detail. Made for jeans.', ['men', 'sale']],
  ['mustard-cotton-kurta', 'Mustard Cotton Kurta', 'kurta-m', 2190, null, 'cotton', [18418574], 'daily-wear', 'Mustard cotton with a mandarin collar and side pockets. Soft from the first wear.', ['men', 'everyday']],
  ['grey-silk-embroidered-kurta', 'Grey Silk Embroidered Kurta', 'kurta-m', 5490, null, 'silk', [8217656], 'wedding', 'Grey art silk with dense thread work at the neck. For the wedding you are in the photos at.', ['men', 'wedding']],
  ['lime-jacquard-kurta', 'Lime Jacquard Kurta', 'kurta-m', 2790, null, 'rayon', [34741232], 'festive', 'Lime jacquard with a woven texture and a band collar. Bright, and meant to be.', ['men', 'festive']],
]

const KIND = {
  sari: { cat: CAT.sari, type: TYPE.one, gender: 'women', sizes: null, set: 'frata:sari-and-blouse-piece', hsn: '5007', grams: 700 },
  lehenga: { cat: CAT.lehenga, type: TYPE.one, gender: 'women', sizes: LEHENGA_SIZES, set: 'frata:lehenga-blouse-and-dupatta', hsn: '6204', grams: 1600 },
  suit: { cat: CAT.suit, type: TYPE.women, gender: 'women', sizes: WOMEN_SIZES, set: 'frata:kurta-pants-and-dupatta', hsn: '6204', grams: 600 },
  'kurta-w': { cat: CAT.kurta, type: TYPE.women, gender: 'women', sizes: WOMEN_SIZES, set: 'frata:kurta-only', hsn: '6206', grams: 300 },
  'kurta-m': { cat: CAT.kurta, type: TYPE.men, gender: 'men', sizes: MEN_SIZES, set: 'frata:kurta-only', hsn: '6205', grams: 400 },
}

const COLLECTIONS = [
  ['saris', 'Saris', 'Chanderi, silk, tissue and handloom cotton. Every sari comes with a blouse piece.', 'auto', [{ field: 'category', value: CAT.sari }], 'newest'],
  ['lehengas', 'Lehengas', 'Lehengas for the wedding, the sangeet and the reception.', 'auto', [{ field: 'category', value: CAT.lehenga }], 'newest'],
  ['kurta-sets', 'Kurta sets', 'Kurta, pants and dupatta, ready to wear.', 'auto', [{ field: 'category', value: CAT.suit }], 'newest'],
  ['men', 'Men', 'Kurtas and sets for every occasion on the calendar.', 'auto', [{ field: 'tag', value: 'men' }], 'newest'],
  ['wedding-edit', 'The wedding edit', 'What to wear when someone you love gets married.', 'auto', [{ field: 'tag', value: 'wedding' }], 'price_high'],
  ['under-2999', 'Under ₹2,999', 'Good pieces, kind prices.', 'auto', [{ field: 'price_below', value: rs(3000) }], 'price_low'],
]

const sql = (v) => (v === null || v === undefined ? 'null' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)
const arr = (xs) => `'{${xs.map((x) => `"${String(x).replace(/"/g, '\\"')}"`).join(',')}}'`
const json = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`

async function photo(id) {
  const res = await fetch(`https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1600`)
  if (!res.ok) throw new Error(`photo ${id}: ${res.status}`)
  const src = sharp(Buffer.from(await res.arrayBuffer())).rotate()
  const meta = await src.metadata()
  const uuid = randomUUID(), base = `tenants/${TENANT}/products/${uuid}`
  const widths = [400, 800, 1200, 1600].filter((w) => w <= meta.width)
  let url = null
  for (const w of widths) {
    const buf = await src.clone().resize({ width: w }).webp({ quality: 80 }).toBuffer()
    const r = await put(`${base}-${w}.webp`, buf, { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'image/webp' })
    url = r.url
  }
  const largest = widths.at(-1)
  return { base: url.replace(/-\d+\.webp$/, ''), widths, width: largest, height: Math.round((meta.height * largest) / meta.width) }
}

const out = ['begin;', `-- House Of Ayuda demo catalogue (scripts/demo/house-of-ayuda.mjs). Replaces an earlier run's pieces and collections.`]
out.push(`delete from products where tenant_id = ${sql(TENANT)} and handle in (${PIECES.map((p) => sql(p[0])).join(', ')});`)
out.push(`delete from collections where tenant_id = ${sql(TENANT)} and handle in (${COLLECTIONS.map((c) => sql(c[0])).join(', ')});`)
let n = 0
for (const [handle, title, kind, price, compareAt, fabric, photos, occasion, description, tags] of PIECES) {
  const k = KIND[kind], pid = randomUUID(), at = new Date(Date.now() - (PIECES.length - n) * 3_600_000).toISOString()
  const options = k.sizes ? ['Size'] : [], optionValues = k.sizes ? [k.sizes] : []
  out.push(`insert into products (id, tenant_id, handle, title, description, type_id, options, option_values, origin_country, hsn, status, published_at, created_at, taxonomy_category, tags) values (${sql(pid)}, ${sql(TENANT)}, ${sql(handle)}, ${sql(title)}, ${sql(description)}, ${sql(k.type)}, ${arr(options)}, ${json(optionValues)}, 'IN', ${sql(k.hsn)}, 'active', ${sql(at)}, ${sql(at)}, ${sql(k.cat)}, ${arr(tags)});`)
  const sizes = k.sizes ?? [null]
  sizes.forEach((s, i) => {
    // Stock that tests the shop: plenty of most sizes, a low one, and now and then a sold-out size.
    const stock = s === 'XXL' ? 0 : s === 'XS' ? 2 : (n + i) % 7 === 0 ? 1 : 6 + ((n + i) % 5)
    const code = `HOA-${handle.split('-').map((w) => w[0]).join('').toUpperCase()}${s ? `-${s}` : ''}`
    out.push(`insert into variants (tenant_id, product_id, option_values, sku, price, compare_at, unit_cost, stock, weight_grams, position) values (${sql(TENANT)}, ${sql(pid)}, ${arr(s ? [s] : [])}, ${sql(code)}, ${rs(price)}, ${compareAt ? rs(compareAt) : 'null'}, ${Math.round(rs(price) * 0.42)}, ${stock}, ${k.grams}, ${i});`)
  })
  let pos = 0
  for (const id of photos) {
    const ph = await photo(id)
    out.push(`insert into product_images (tenant_id, product_id, base, widths, width, height, alt, position) values (${sql(TENANT)}, ${sql(pid)}, ${sql(ph.base)}, '{${ph.widths.join(',')}}', ${ph.width}, ${ph.height}, ${sql(pos === 0 ? title : `${title}, another view`)}, ${pos});`)
    pos++
    process.stderr.write(`  ${handle}: photo ${id} uploaded\n`)
  }
  for (const [attribute, values] of [['target-gender', [GENDER[k.gender]]], ['age-group', ['2403']], ['fabric', [FABRIC[fabric]]], ['frata-occasion', [`frata:${occasion}`]], ['frata-set-includes', [k.set]]]) {
    out.push(`insert into product_attributes (tenant_id, product_id, attribute, values) values (${sql(TENANT)}, ${sql(pid)}, ${sql(attribute)}, ${arr(values)});`)
  }
  n++
}
for (const [handle, title, description, kind, rules, sort] of COLLECTIONS) {
  out.push(`insert into collections (tenant_id, handle, title, description, kind, match_all, rules, sort) values (${sql(TENANT)}, ${sql(handle)}, ${sql(title)}, ${sql(description)}, ${sql(kind)}, 1, ${json(rules)}, ${sql(sort)});`)
}
out.push('commit;')
console.log(out.join('\n'))
