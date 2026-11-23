import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// check:packs (plan docs/plans/2026-11-23-c1-category-packs.md, C1a·5): fixtures for each rule's pass and fail, built
// from the real tree so a pass case is today's code.
const { packProblems, readTree } = await import('../check-packs.mjs')
type Tree = { packs: Record<string, string>; list: string; migrations: { tag: string; text: string }[]; schema: string; src: Record<string, string> }
const real = (): Tree => readTree(process.cwd())
const run = (edit: (t: Tree) => void) => { const t = real(); edit(t); return packProblems(t) as string[] }

const PET = `import { pure } from './define'\nexport const pet_supplies = /*#__PURE__*/ pure(() => ({ key: 'pet_supplies', tile: { label: 'Pet supplies', order: 75, icon: 'M3 3h4' } }))\n`
const addPet = (t: Tree) => {
  t.packs['pet_supplies'] = PET
  t.list = t.list.replace("import { women } from './women'", "import { women } from './women'\nimport { pet_supplies } from './pet_supplies'")
    .replace('beauty, wellness]', 'beauty, wellness, pet_supplies]')
}
const NINE = `'women','men','kids','ethnic','accessories','footwear','jewellery','beauty','wellness'`
const widen = (keys: string) => ({ tag: '0171_pets', text: `ALTER TABLE "shop_settings" DROP CONSTRAINT "shop_settings_sells";--> statement-breakpoint\nALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_sells" CHECK ("shop_settings"."sells" <@ array[${keys}]::text[]);` })
/** Today's presetsFor before C1a·3 (size-charts.ts:34-47 on 2026-11-23): its lines name `s`, not `sells`. */
const SIZE_CHARTS_BEFORE = `export function presetsFor(sells: readonly (typeof SELL_KEYS)[number][]): Preset[] {
  const keys = new Set<string>()
  for (const s of sells) {
    if (s === 'women' || s === 'ethnic') keys.add('womens_kurta')
    if (s === 'men') keys.add('mens_shirt')
    if (s === 'kids') keys.add('kids')
    if (s === 'footwear') keys.add('footwear')
    if (s === 'accessories' || s === 'jewellery' || s === 'beauty' || s === 'wellness') keys.add('one_size')
  }
  return [...keys].map((k) => PRESETS[k]!)
}
`

describe('check:packs', () => {
  it('today’s tree is clean', () => {
    expect(packProblems(real())).toEqual([])
  })
  it('rule 1: a pack file holds one key, its own name', () => {
    expect(run((t) => { t.packs.women = t.packs.women!.replace("key: 'women'", "key: 'woman'") }).join()).toMatch(/women\.ts.*key/)
    expect(run((t) => { t.packs.men = t.packs.men! + "\nconst x = { key: 'men' }\n" }).join()).toMatch(/men\.ts.*exactly one/)
  })
  it('rule 2: every pack file is in the list, every listed name has a file', () => {
    expect(run((t) => { t.packs['pet_supplies'] = PET }).join()).toMatch(/pet_supplies.*not in PACKS/)
    expect(run((t) => { delete t.packs.wellness }).join()).toMatch(/wellness.*no pack file/)
  })
  it('rule 3: a 10th pack needs the migration that widens the CHECK; with it, clean', () => {
    expect(run(addPet).join()).toMatch(/pet_supplies.*widen the CHECK first/)
    expect(run((t) => { addPet(t); t.migrations.push(widen(`${NINE},'pet_supplies'`)) })).toEqual([])
  })
  it('rule 3: a key the CHECK holds is never removed; the order is the list’s', () => {
    expect(run((t) => { t.migrations.push(widen(`${NINE},'toys'`)) }).join()).toMatch(/toys.*never removed/)
    expect(run((t) => { t.migrations.push(widen(NINE.replace("'women','men'", "'men','women'"))) }).join()).toMatch(/order/)
  })
  it('rule 3: the CREATE TABLE form is read; a drop with no new CHECK fails', () => {
    const create = { tag: '0007_x', text: `CREATE TABLE "shop_settings" (\n\t"sells" text[] DEFAULT '{}'::text[] NOT NULL,\n\tCONSTRAINT "shop_settings_sells" CHECK ("shop_settings"."sells" <@ array[${NINE}]::text[])\n);` }
    expect(run((t) => { t.migrations = [create] })).toEqual([])
    expect(run((t) => { t.migrations = [{ ...create, text: create.text.replace(",'wellness'", '') }] }).join()).toMatch(/wellness.*widen/)
    expect(run((t) => { t.migrations.push({ tag: '0171_drop', text: 'ALTER TABLE "shop_settings" DROP CONSTRAINT "shop_settings_sells";' }) }).join()).toMatch(/no shop_settings_sells CHECK/)
  })
  it('rule 4: schema.ts builds the CHECK from SELL_KEYS', () => {
    expect(run((t) => { t.schema = t.schema.replace('${sql.raw(sqlList(SELL_KEYS))}', NINE) }).join()).toMatch(/schema\.ts/)
  })
  it('rule 5: a quoted sell key outside the packs fails, today’s size-charts.ts among them', () => {
    expect(run((t) => { t.src['src/domains/catalogue/size-charts.ts'] = SIZE_CHARTS_BEFORE }).join()).toMatch(/size-charts\.ts:4 .*'women'/)
    expect(run((t) => { t.src['src/lib/x.ts'] = 'const on = sells.includes("beauty")\n' }).join()).toMatch(/src\/lib\/x\.ts:1/)
    expect(run((t) => { t.src['src/lib/x.ts'] = '// a comment may say \'women\'\n' })).toEqual([])
  })
  it('rule 5: the allowlist (product kinds, frozen theme code) and tests pass', () => {
    expect(run((t) => {
      t.src['src/domains/catalogue/kind.ts'] = "if (has(w, KIDS)) return 'kids'\n"
      t.src['src/domains/themes/catalogue/samples.ts'] = "if (sells.includes('footwear')) return 'footwear'\n"
      t.src['src/lib/__tests__/x.test.ts'] = "expect(f(['women'])).toBe(1)\n"
    })).toEqual([])
  })
  it('the gate does not match its own documentation', () => {
    const self = readFileSync('scripts/check-packs.mjs', 'utf8')
    expect(run((t) => { t.migrations.push({ tag: 'check-packs', text: self }); t.src['src/check-packs.mjs'] = self })).toEqual([])
  })
})
