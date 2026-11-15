#!/usr/bin/env node
// =============================================================================
// FILE: scripts/check-words.mjs — `node scripts/check-words.mjs [--warn] [--write-todo]`
//
// The Words rulebook where a script can hold it (frata-design-language § Words and § Glossary; Neel mockup § Words).
// A store owner reads the console on a phone, between orders: every line must be clear in one read.
//
// Reads every string a person reads, through TypeScript's parser (as check-name does): string literals, template
// text joined into one sentence (a stand-in word per ${}), and JSX text joined across its {expressions}. Never
// reads comments, identifiers, import paths, object keys, tagged templates (sql``), the arguments of console.*,
// Error, cn/cva/twMerge and other code calls, className and other code attributes, header objects, MIME and CSP
// values, or a code-shaped token (lower case, snake, dotted, a path). A capitalised single word is UI text.
// scripts/ and .claude/ are never read, so this file and the skill that quotes the rules never match themselves.
//
// Two scopes. FILLER (the old check:voice list) runs on all of src/. The rest run on the surfaces N3 swept: the
// console, the partner workspace and the shared code that speaks there (ROOTS / NOT below, each with its reason).
//
// Exceptions: scripts/check-words.allow.json, [{ file, rule, text, why }] (text: a fragment of the string). An
// entry nothing matches fails, so the list never rots. Debts: scripts/check-words.todo, "count path · rule", which
// only shrinks: more than listed fails, fewer fails until the line is lowered, a file not listed fails.
// =============================================================================
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const ALLOW_FILE = 'scripts/check-words.allow.json'
const TODO_FILE = 'scripts/check-words.todo'

/** The surfaces N3 holds to the rulebook. */
export const ROOTS = ['src/app/(console)', 'src/app/(partner)', 'src/app/(lookeditor)', 'src/app/choose', 'src/app/join',
  'src/components', 'src/lib', 'src/domains']
/** Inside ROOTS but not N3's: each line says why. */
export const NOT = [
  'src/components/storefront/', // the shop's pages: themes retire (ADR-0014), store pages stay 0 px
  'src/components/ekcode/', // EkCode speaks to shoppers in its own brand (ADR-0009)
  'src/components/shop-preview/', // the shop's own words, drawn inside the console's preview
  'src/lib/db/', // schema and SQL
  'src/lib/admin/', // Frrata Admin: N4
  'src/lib/storefront/', 'src/lib/ekcode/', 'src/lib/seo/', 'src/lib/documents/', // shoppers, search engines, PDFs
  'src/domains/themes/', 'src/domains/checkout/', 'src/domains/storefront/', 'src/domains/ekcode-core/',
  'src/domains/pages/', 'src/domains/policies/', 'src/domains/seo/', 'src/domains/documents/', // shopper-facing, legal
  'src/domains/storefront-api/docs.ts', // the API's developer docs (SA1b D·9): developers' words (key, token, API), words-reviewer reads them
]
export const inScope = (file) => ROOTS.some((r) => file.startsWith(r + '/')) && !NOT.some((n) => file.startsWith(n))

// ---------------------------------------------------------------------------------------------------------------
// Reading what a person reads
// ---------------------------------------------------------------------------------------------------------------
const CODE_CALL = /^(console\.\w+|Error|TypeError|RangeError|errName|cn|cva|twMerge|clsx|sql|sql\.raw|require|import|fetch|fetchWithTimeout|URL|URLSearchParams|RegExp|redirect|notFound|revalidatePath|revalidateTag|updateTag|refreshShop|refreshHosts|cacheTag|unstable_cache|Symbol|JSON\.parse|.*\.(get|has|delete|getAll|append|includes|startsWith|endsWith|indexOf|split|replace|replaceAll|match|matchAll|test|querySelector|querySelectorAll|getElementById|getItem|setItem|removeItem|addEventListener|removeEventListener|setAttribute|getAttribute|closest|cookies|header|headers|localeCompare|padStart|padEnd|join|toLocaleString|toLocaleDateString|enqueue|from|where|select|execute|insert|update|values|returning|innerJoin|leftJoin|orderBy|groupBy))$/
const CODE_ATTR = /^(className|class|id|href|src|srcSet|key|type|name|rel|target|method|action|role|htmlFor|style|autoComplete|inputMode|pattern|accept|form|lang|dir|as|tone|variant|size|icon|kind|mode|sizes|loading|decoding|fetchPriority|referrerPolicy|sandbox|allow|data-[\w-]+|aria-(controls|describedby|labelledby|haspopup|current|live|expanded|selected|hidden|invalid|owns|activedescendant)|enterKeyHint|spellCheck|wrap|step|min|max|minLength|maxLength|tab|section|path|prefetch|scroll|replace|align|side|shape|width|height|viewBox|d|fill|stroke|strokeWidth|strokeLinecap|strokeLinejoin|transform|points|x|y|cx|cy|r|x1|x2|y1|y2|offset|stopColor|preserveAspectRatio|xmlns|crossOrigin|integrity|media|charSet|httpEquiv|property|itemProp|nonce|hrefLang|download|encType|capture|list|cols|rows|span|colSpan|rowSpan|scope|headers|start|reversed|datetime|dateTime)$/
const CODE_KEY = /^(className|class|href|path|key|id|tone|icon|kind|type|variant|tab|action|code|slug|handle|table|route|url|tag|tags|cache|cacheTag|mime|contentType|locale|timeZone|currency|style|css|selector|query|sql|regex|pattern|method|templateName|role|permission|cookie|header|headers|env|moduleKey|resource|cron|ref|color|colour|font|weight|align|mode|layout|shape|grid|width|height|src)$/
const HEADER_KEY = /^[A-Z][a-z]+(-[A-Z][a-z]+)+$|^(content-type|cache-control|x-[\w-]+)$/i

/** A string that is code, not words: no letters, a code-shaped token, a MIME type or CSP, or class names. */
export function isCode(text) {
  const t = text.trim()
  if (!/\p{L}/u.test(t)) return true
  if (/^[a-z0-9_.:/@#?=&%+*~$\-[\]()<>|^!,]*$/.test(t)) return true // one lower-case token: a key, tag, path, route
  if (/^[\w-]+=\S*(; |$)/.test(t)) return true // a cookie
  if (/^[MLHVCSQTAZmlhvcsqtaz][\d\s.,MLHVCSQTAZmlhvcsqtaz-]+$/.test(t)) return true // SVG path data
  { const ws = t.split(/\s+/); if (ws.length >= 4 && ws.reduce((a, w) => a + w.length, 0) / ws.length < 2) return true } // a table of letters
  if (/^\S+\.(xml|csv|pdf|json|txt|zip|png|jpe?g|webp|svg|html?)$/i.test(t)) return true // a file name
  if (/\b[\w-]+\/[\w.+-]+;|\b[a-z-]+-src\b|^https?:\/\/\S+$|^mailto:|^tel:|^\/\S*$|^#\S*$/.test(t)) return true
  const tokens = t.split(/\s+/)
  const classy = tokens.filter((w) => /^(-?[a-z0-9]+(-[a-z0-9./[\]%#]+)+|[a-z0-9-]+:[\w[\]/.-]+|\[[^\]]+\]|[a-z]+\/[\d.]+|!?[a-z]+(-[a-z0-9]+)*)$/.test(w) && !/^[a-z]+$/.test(w)).length
  if (tokens.length >= 2 && classy / tokens.length >= 0.5) return true
  if (/^(SELECT|INSERT|UPDATE|DELETE|WITH)\b/.test(t) || /^(select|insert|update|delete|with)\b[\s\S]*\b(from|into|set|where)\b[\s\S]*[*(=]/.test(t)) return true
  if (/\b(is null|is not null|coalesce\(|::(int|text|jsonb|bigint|uuid))/i.test(t)) return true
  return false
}

const calleeText = (n, sf) => (ts.isCallExpression(n) || ts.isNewExpression(n)) ? n.expression.getText(sf).replace(/\?\./g, '.') : ''

/** Is this node inside something that holds code, not words? */
function codeContext(n, sf) {
  for (let p = n.parent, child = n; p; child = p, p = p.parent) {
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p) || ts.isImportTypeNode?.(p)) return true
    if (ts.isTaggedTemplateExpression(p)) return true
    if (ts.isExpressionStatement(p) && child === p.expression && ts.isStringLiteral(child)) return true // 'use server'
    if (ts.isLiteralTypeNode(p)) return true
    if ((ts.isCallExpression(p) || ts.isNewExpression(p)) && child !== p.expression && CODE_CALL.test(calleeText(p, sf))) return true
    if (ts.isJsxAttribute(p)) return CODE_ATTR.test(p.name.getText(sf))
    if (ts.isPropertyAssignment(p) && child === p.initializer) {
      const k = p.name.getText(sf).replace(/^['"]|['"]$/g, '')
      if (CODE_KEY.test(k) || HEADER_KEY.test(k)) return true
      // A header object: any sibling key shaped like Content-Type.
      if (p.parent && ts.isObjectLiteralExpression(p.parent) && p.parent.properties.some((q) => q.name && HEADER_KEY.test(q.name.getText(sf).replace(/^['"]|['"]$/g, '')))) return true
    }
    if (ts.isPropertyAssignment(p) && child === p.name) return true
    if (ts.isElementAccessExpression(p) && child === p.argumentExpression) return true
    if (ts.isCaseClause(p) && child === p.expression) return true
    if (ts.isBinaryExpression(p) && /^(===|!==|==|!=|in|instanceof)$/.test(p.operatorToken.getText(sf))) return true
    if (ts.isComputedPropertyName(p)) return true
    if (ts.isEnumMember(p)) return true
    // Stop climbing at the statement or the JSX element that owns the string.
    if (ts.isStatement(p) || ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p)) return false
  }
  return false
}

const ENTITY = { ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', apos: "'", quot: '"', amp: '&', nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', middot: '·', rarr: '→', larr: '←', times: '×', rsaquo: '›', lsaquo: '‹', gt: '>', lt: '<' }
/** JSX text as a person reads it: &ldquo; is a quote mark, not a semicolon. */
const entities = (t) => t.replace(/&([a-z]+);/g, (m, k) => ENTITY[k] ?? m)

/** Every string a person reads in one file: [{ text, line, prop }] (prop: the key it is the value of, if any). */
export function readable(source, fileName = 'x.tsx') {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const out = []
  const line = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
  const prop = (n) => (n.parent && ts.isPropertyAssignment(n.parent) && n.parent.initializer === n ? n.parent.name.getText(sf).replace(/^['"]|['"]$/g, '') : null)
  // Code-shaped strings are kept, marked, for the filler list only (check:voice read every quoted string).
  const push = (n, text) => out.push({ text: text.replace(/\s+/g, ' ').trim(), line: line(n), prop: prop(n), code: isCode(text) || codeContext(n, sf) })
  const visit = (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) { if (!(n.parent && ts.isTaggedTemplateExpression(n.parent))) push(n, n.text); return }
    if (ts.isTemplateExpression(n)) {
      if (!(n.parent && ts.isTaggedTemplateExpression(n.parent))) push(n, n.head.text + n.templateSpans.map((s) => 'X' + s.literal.text).join(''))
      n.templateSpans.forEach((s) => visit(s.expression))
      return
    }
    if (ts.isJsxElement(n) || ts.isJsxFragment(n)) {
      // The element's own sentence: its text, an {expression} or a child element as one stand-in word.
      let text = '', first = null
      for (const c of n.children) {
        if (ts.isJsxText(c)) { if (c.text.trim()) { text += entities(c.text); first ??= c } } else if (ts.isJsxExpression(c) && c.expression && ts.isStringLiteral(c.expression)) text += c.expression.text // {' · '} is text
        else if (text.trim()) text += ' X '
      }
      // JSX text is never code: a single lower-case word between tags is still a word a person reads.
      if (first && /\p{L}/u.test(text)) out.push({ text: text.replace(/(X\s*)+$/, '').replace(/\s+/g, ' ').trim(), line: line(first), prop: null, jsx: true, code: false })
      ts.forEachChild(n, (c) => { if (!ts.isJsxText(c)) visit(c) })
      return
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

// ---------------------------------------------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------------------------------------------
const FILLER = ['simply', 'easily', 'seamless', 'seamlessly', 'effortless', 'effortlessly', 'powerful', 'unlock', 'unleash',
  'leverage', 'robust', 'world-class', 'cutting-edge', 'hassle-free', 'revolutionary', 'game-changer', 'supercharge',
  'best-in-class', 'oops', 'whoops', 'kindly', 'please note']
const list = (words, flags = 'i') => new RegExp(`(?<![\\p{L}\\d-])(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}\\d-])`, 'u' + flags)
const RE_FILLER = list(FILLER)
const RE_SWAP = list(['in order to', 'prior to', 'utilise', 'utilize', 'utilised', 'utilized', 'via', 'e.g.', 'commence', 'respective', 'respectively',
  'successfully', 'please', 'sorry', 'is not able to', 'at this time', 'in case of', 'invalid', 'error occurred', 'an error has occurred',
  'exceeded', 'something went wrong', 'are you sure', "let's", 'let’s', 'congratulations'])
const RE_OURS = list(['tenant', 'tenants', 'webhook', 'webhooks', 'sync', 'synced', 'syncing', 'server', 'servers', 'token', 'tokens', 'readiness',
  'variant', 'variants', 'NDR', 'pincode', 'pincodes', 'coupon', 'coupons', 'voucher', 'vouchers', 'support session', 'support sessions',
  'SKU combo', 'UQC', 'merchant', 'merchants', 'buyer', 'buyers', 'your customer', 'your customers', 'settlement', 'settlements', 'remittance',
  'remittances', 'module', 'modules', 'add-on', 'add-ons', 'dashboard', 'partner console', 'website', 'websites', 'piece', 'pieces',
  'color', 'colors', 'canceled', 'catalog'])
const RE_CASED = list(['API', 'APIs', 'MRP', 'pin code', 'Pin code', 'Pin Code', 'PIN Code'], '') // case-sensitive: the short forms
const RE_SHOP = /(?<![\p{L}\d-])(shop|shops|shop’s|shop's)(?![\p{L}\d-])/iu
const SHOP_VERBS = /\bShop (all|now|the look)\b/g
const RE_ADMIN = /(?<!Frrata )(?<![\p{L}\d-])admins?(?![\p{L}\d-])/iu
const STATE_FILES = ['src/app/(console)/console/orders/_components/labels.ts', 'src/domains/email/words.ts']
const BUTTONS = new Set(['OK', 'Ok', 'Submit', 'Proceed', 'Click here'])
const ABBR = /\b(M\.R\.P|incl|e\.g|i\.e|approx|no|nos|vs|Rs|Dr|Mr|Ms|Mrs|St)\.(?=\s|$)/gi

/** Sentences of a string, abbreviations kept whole. */
export const sentences = (text) => text.replace(ABBR, (m) => m.replace(/\./g, '․')).split(/(?<=[.?!])\s+(?=[\p{Lu}\d₹"“‘'(X])| · /u).map((s) => s.replace(/․/g, '.'))
const words = (s) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}₹]/u.test(w))
const isValue = (s) => /^\s*([\d₹+−\-X"“'‘(]|$)/.test(s)

/** The rules one readable string breaks: [{ rule, why }]; warns: [{ rule, why }]. */
export function judgeText(s, file) {
  const fails = [], warns = []
  const t = s.text
  const fail = (rule, why) => fails.push({ rule, why })
  if (RE_FILLER.test(t)) fail('filler', `"${t.match(RE_FILLER)[1]}": say what it does instead`)
  if (s.code || !inScope(file)) return { fails, warns }
  for (const sent of sentences(t)) {
    const n = words(sent).length
    if (n >= 16) fail('W1', `${n} words in one sentence: cut it or make it two`)
    else if (n >= 13) warns.push({ rule: 'W1', why: `${n} words` })
    if (/[\p{L}\d)’'"”»]; +\p{L}/u.test(sent)) fail('W2', 'a semicolon joins two thoughts: make it two sentences')
    for (const m of sent.matchAll(/: +/g)) {
      const after = sent.slice(m.index + m[0].length)
      if (!isValue(after) && words(after).length >= 3) { fail('W2', 'a colon joins two thoughts: make it two sentences'); break }
    }
    for (const m of sent.matchAll(/ [—–] /g)) {
      const before = sent.slice(0, m.index), after = sent.slice(m.index + 3)
      if (words(before).length >= 2 && words(after).length >= 2 && !/[\dX]\S*$/.test(before) && !/^\S*[\dX]/.test(after)) { fail('W2', 'a dash joins two thoughts: make it two sentences'); break }
    }
    if (/!\s*$/.test(sent) && words(sent).length > 0) fail('W9', 'no exclamation marks')
  }
  if (/\p{Extended_Pictographic}/u.test(t)) fail('W9', 'no emoji')
  for (const re of [RE_SWAP]) { const m = t.match(re); if (m) fail('W3', `"${m[1]}": the swap list says what to write`) }
  { const m = t.match(RE_OURS) ?? t.match(RE_CASED); if (m) fail('W4', `"${m[1]}": not a store owner's word (§ Glossary)`) }
  if (RE_SHOP.test(t.replace(SHOP_VERBS, ''))) fail('W5', '"shop": the word is "store" (owner, 2026-11-13)')
  if (RE_ADMIN.test(t)) fail('W6', '"admin" is not a person: Manager, or Frrata Admin for the staff surface')
  if (STATE_FILES.includes(file) && /^(Shipped|Confirmed)$/.test(t) && s.prop && /^(label|shipped|confirmed)$/.test(s.prop)) fail('W7', `"${t}" as a state: On the way, To pack (§ Glossary, order states)`)
  if (s.jsx && BUTTONS.has(t)) fail('W8', 'a button says a verb and a thing')
  return { fails, warns }
}

/** All findings in one file. */
export function check(source, file) {
  const fails = [], warns = []
  for (const s of readable(source, file)) {
    const r = judgeText(s, file)
    for (const f of r.fails) fails.push({ file, line: s.line, text: s.text, ...f })
    for (const w of r.warns) warns.push({ file, line: s.line, text: s.text, ...w })
  }
  return { fails, warns }
}

/** Findings against the allow list and the shrink-only todo: what fails. */
export function judge(fails, allow, todo) {
  const used = new Set(), left = []
  for (const f of fails) {
    const i = allow.findIndex((a) => a.file === f.file && a.rule === f.rule && f.text.includes(a.text))
    if (i >= 0) used.add(i); else left.push(f)
  }
  const problems = []
  allow.forEach((a, i) => { if (!used.has(i)) problems.push(`${ALLOW_FILE}: unused entry ${a.file} · ${a.rule} "${a.text}" (remove it)`) })
  const counts = new Map()
  for (const f of left) counts.set(`${f.file} · ${f.rule}`, (counts.get(`${f.file} · ${f.rule}`) ?? 0) + 1)
  for (const [k, n] of counts) {
    const listed = todo.get(k)
    if (listed === undefined) for (const f of left.filter((x) => `${x.file} · ${x.rule}` === k)) problems.push(`${f.file}:${f.line}  ${f.rule} ${f.why}  "${f.text.slice(0, 90)}"`)
    else if (n > listed) problems.push(`${TODO_FILE}: ${k} has ${n}, listed ${listed} — a new one is a regression (run with --show ${k.split(' · ')[0]})`)
    else if (n < listed) problems.push(`${TODO_FILE}: ${k} is down to ${n}: lower the line to ${n}`)
  }
  for (const [k] of todo) if (!counts.has(k)) problems.push(`${TODO_FILE}: ${k} is clean: remove the line`)
  return problems
}

function walk(p, acc = []) {
  if (!existsSync(p)) return acc
  if (statSync(p).isDirectory()) { for (const e of readdirSync(p)) if (e !== '__tests__' && e !== 'node_modules') walk(join(p, e), acc); return acc }
  if (/\.tsx?$/.test(p) && !/\.(test|spec)\.tsx?$/.test(p)) acc.push(p)
  return acc
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const allow = existsSync(ALLOW_FILE) ? JSON.parse(readFileSync(ALLOW_FILE, 'utf8')) : []
  const todo = new Map(existsSync(TODO_FILE) ? readFileSync(TODO_FILE, 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => { const m = l.match(/^(\d+) (.+ · \w+)$/); if (!m) { console.error(`check:words — ${TODO_FILE}: "${l}" is not "count path · rule"`); process.exit(1) } return [m[2], Number(m[1])] }) : [])
  const fails = [], warns = []
  for (const f of walk('src')) {
    const file = relative('.', f).replaceAll('\\', '/')
    const r = check(readFileSync(f, 'utf8'), file)
    fails.push(...r.fails); warns.push(...r.warns)
  }
  const show = args.indexOf('--show')
  if (show >= 0) { for (const f of fails.filter((x) => x.file.startsWith(args[show + 1] ?? ''))) console.log(`${f.file}:${f.line}  ${f.rule}  ${f.why}\n    "${f.text}"`); process.exit(0) }
  if (args.includes('--write-todo')) {
    const allowed = (f) => allow.some((a) => a.file === f.file && a.rule === f.rule && f.text.includes(a.text))
    const counts = new Map()
    for (const f of fails.filter((x) => !allowed(x))) counts.set(`${f.file} · ${f.rule}`, (counts.get(`${f.file} · ${f.rule}`) ?? 0) + 1)
    const head = '# check:words debts, "count path · rule". Shrink-only: each N3 sweep step removes its lines; N3 deletes the file.\n'
    writeFileSync(TODO_FILE, head + [...counts].sort().map(([k, n]) => `${n} ${k}`).join('\n') + '\n')
    console.log(`check:words — wrote ${counts.size} lines to ${TODO_FILE}`)
    process.exit(0)
  }
  if (args.includes('--warn')) for (const w of warns) console.log(`${w.file}:${w.line}  ${w.why}  "${w.text.slice(0, 100)}"`)
  const problems = judge(fails, allow, todo)
  if (problems.length) { console.error(`check:words — ${problems.length} problem(s) (frata-design-language § Words):\n  ${problems.join('\n  ')}`); process.exit(1) }
  const debt = [...todo.values()].reduce((a, b) => a + b, 0)
  console.log(`check:words — clean (${warns.length} sentences of 13–15 words${debt ? `; ${debt} listed debts to sweep` : ''})`)
}
