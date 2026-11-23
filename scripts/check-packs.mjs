#!/usr/bin/env node
// Fails: a category pack that is not one file named by its key, a pack missing from the registry's list, a registry whose keys differ from the shop_settings_sells CHECK the newest migration adds, or a sell key quoted outside the packs.
//
// check:packs — the category packs (plan docs/plans/2026-11-23-c1-category-packs.md, C1a·5). A new category is one pack
// file, one line in packs/list.ts and one generated migration; this gate holds that shape. Comment lines (//, /*, *, --)
// are skipped everywhere, so this header never trips it.
//   1  every src/domains/catalogue/packs/*.ts but the registry's own files holds exactly one key: '<k>', <k> its file name
//   2  packs/list.ts imports each pack file and names it in PACKS = [ … ]; a listed name has a pack file
//   3  the last shop_settings_sells CHECK the migrations add (journal order; the ALTER TABLE and the CREATE TABLE forms)
//      lists exactly the registry's keys, in PACKS order
//   4  schema.ts's shop_settings_sells line names SELL_KEYS and quotes no key
//   5  no src file outside packs/ and tests quotes a sell key, but the ALLOW list below, each with its reason
// =============================================================================
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

const PACKS_DIR = 'src/domains/catalogue/packs'
/** The registry's own files in packs/: everything else there is a pack. */
const NOT_PACKS = new Set(['index', 'list', 'registry', 'types', 'shared', 'define'])
/** Files that may quote a sell key, each with its reason (rule 5). */
export const ALLOW = [
  ['src/domains/catalogue/kind.ts', 'product kinds (footwear, kids), not sell keys'],
  ['src/app/(console)/console/products/new/new-product-form.tsx', 'product kinds (footwear, kids), not sell keys'],
  ['src/domains/themes/catalogue/', 'frozen theme code (ADR-0014): goodFor, SampleSet and sampleSetFor'],
]

const isComment = (line) => /^\s*(\/\/|\/\*|\*|--)/.test(line)
const codeLines = (text) => text.split(/\r?\n/).map((line, i) => [i + 1, line]).filter(([, l]) => !isComment(l))
const quoted = (s) => [...s.matchAll(/'([^']*)'/g)].map((m) => m[1])

/** @param {{ packs: Record<string, string>, list: string, migrations: { tag: string, text: string }[], schema: string, src: Record<string, string> }} t */
export function packProblems(t) {
  const out = []
  // 1: one key per pack file, its name.
  const keyOf = {}
  for (const [name, text] of Object.entries(t.packs)) {
    const keys = codeLines(text).flatMap(([, l]) => [...l.matchAll(/\bkey:\s*'([^']*)'/g)].map((m) => m[1]))
    if (keys.length !== 1) out.push(`${PACKS_DIR}/${name}.ts  holds ${keys.length} key: lines — a pack file holds exactly one`)
    else if (keys[0] !== name) out.push(`${PACKS_DIR}/${name}.ts  has key: '${keys[0]}' — a pack's key is its file name`)
    keyOf[name] = keys[0] ?? name
  }
  // 2: the list imports each pack and names it; its order is the registry's.
  const list = codeLines(t.list).map(([, l]) => l).join('\n')
  const fileOf = Object.fromEntries([...list.matchAll(/import\s*\{\s*(\w+)\s*\}\s*from\s*'\.\/(\w+)'/g)].map((m) => [m[1], m[2]]))
  const arr = list.match(/PACKS\s*=[^[]*\[([^\]]*)\]/)
  const listed = arr ? arr[1].split(',').map((s) => s.trim()).filter(Boolean) : []
  if (!arr) out.push(`${PACKS_DIR}/list.ts  has no PACKS = [ … ]`)
  const order = []
  for (const id of listed) {
    const f = fileOf[id]
    if (!f || !(f in t.packs)) out.push(`${PACKS_DIR}/list.ts  lists ${id}, which has no pack file`)
    else order.push(keyOf[f])
  }
  const listedFiles = new Set(listed.map((id) => fileOf[id]))
  for (const name of Object.keys(t.packs)) if (!listedFiles.has(name)) out.push(`${PACKS_DIR}/${name}.ts  is not in PACKS (packs/list.ts) — append it`)
  const keys = Object.values(keyOf)
  // 3: the newest CHECK lists the registry's keys, in order.
  let check = null
  for (const m of t.migrations) {
    for (const [, l] of codeLines(m.text)) {
      if (/DROP\s+CONSTRAINT\s+(IF\s+EXISTS\s+)?"shop_settings_sells"/.test(l)) check = null
      const add = l.match(/CONSTRAINT\s+"shop_settings_sells"\s+CHECK\s*\(.*?array\[([^\]]*)\]/)
      if (add) check = { tag: m.tag, keys: quoted(add[1]) }
    }
  }
  if (!check) out.push('drizzle/  has no shop_settings_sells CHECK after the last migration — the registry needs one')
  else {
    for (const k of order) if (!check.keys.includes(k)) out.push(`${k}  is a pack but not in the CHECK (${check.tag}) — widen the CHECK first: npm run db:generate, apply the migration before the deploy that adds the pack`)
    for (const k of check.keys) if (!order.includes(k)) out.push(`${k}  is in the CHECK (${check.tag}) but has no pack — a pack is never removed: stores hold its key`)
    const same = check.keys.filter((k) => order.includes(k)), mine = order.filter((k) => check.keys.includes(k))
    if (same.join() !== mine.join()) out.push(`drizzle/${check.tag}  lists the keys in another order than PACKS — append only, never reorder`)
  }
  // 4: schema.ts builds the CHECK from SELL_KEYS.
  const keyRe = keys.length ? new RegExp(`(['"\`])(${keys.join('|')})\\1`) : null
  const line = codeLines(t.schema).find(([, l]) => l.includes("'shop_settings_sells'"))
  if (!line) out.push('src/lib/db/schema.ts  has no shop_settings_sells check')
  else if (!line[1].includes('SELL_KEYS') || (keyRe && keyRe.test(line[1]))) out.push(`src/lib/db/schema.ts:${line[0]}  builds shop_settings_sells by hand — use sqlList(SELL_KEYS)`)
  // 5: no quoted sell key outside the packs.
  if (keyRe) for (const [file, text] of Object.entries(t.src)) {
    if (file.startsWith(`${PACKS_DIR}/`) || /(^|\/)__tests__\/|\.test\.tsx?$/.test(file) || ALLOW.some(([a]) => file === a || (a.endsWith('/') && file.startsWith(a)))) continue
    for (const [n, l] of codeLines(text)) {
      const m = l.match(keyRe)
      if (m) out.push(`${file}:${n}  quotes ${m[0]} — read what a store sells through the packs (@/domains/catalogue/packs), or allowlist the file with its reason`)
    }
  }
  return out
}

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|mjs|js)$/.test(f)) out.push(p)
  }
  return out
}

/** The tree as the gate reads it, from the disk at `root`. */
export function readTree(root) {
  const read = (p) => readFileSync(join(root, p), 'utf8')
  const packs = Object.fromEntries(readdirSync(join(root, PACKS_DIR)).filter((f) => f.endsWith('.ts') && !NOT_PACKS.has(f.slice(0, -3)))
    .map((f) => [f.slice(0, -3), read(`${PACKS_DIR}/${f}`)]))
  const journal = JSON.parse(read('drizzle/meta/_journal.json'))
  const migrations = journal.entries.map((e) => ({ tag: e.tag, text: existsSync(join(root, `drizzle/${e.tag}.sql`)) ? read(`drizzle/${e.tag}.sql`) : '' }))
  const src = Object.fromEntries(walk(join(root, 'src')).map((p) => [relative(root, p).split('\\').join('/'), readFileSync(p, 'utf8')]))
  return { packs, list: read(`${PACKS_DIR}/list.ts`), migrations, schema: read('src/lib/db/schema.ts'), src }
}

function main() {
  const tree = readTree(process.cwd())
  const problems = packProblems(tree)
  if (problems.length) {
    console.error(`check:packs — ${problems.length} problem(s):`)
    for (const p of problems) console.error(`  ${p}`)
    process.exit(1)
  }
  let tag = ''
  for (const m of tree.migrations) if (codeLines(m.text).some(([, l]) => /CONSTRAINT\s+"shop_settings_sells"\s+CHECK/.test(l))) tag = m.tag
  console.log(`check:packs — clean (${Object.keys(tree.packs).length} packs; CHECK in ${tag})`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
