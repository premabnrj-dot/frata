#!/usr/bin/env node
// =============================================================================
// FILE: scripts/check-name.mjs — `node scripts/check-name.mjs [path]`
//
// Fails: the old product name ("Frata", any case, as a whole word) in text a
// person can read — a string literal, a template's text, or JSX text — in
// src/ (tests excluded). The product is "Frrata" (brand spec 2026-11-07).
// Read through TypeScript's own parser, so comments, identifiers
// (frataCollects, FRATA_WHATSAPP) and import paths are never looked at.
//
// Some old-name strings are INTERNAL and must not change: a shopper's saved bag
// (frata.bag.v1), a cookie, the key-derivation salt (renaming it would make
// every stored Razorpay key unreadable), taxonomy ids stored in product rows,
// platform hostnames until the domain move (B·4). Each is listed in
// scripts/check-name.allow.json with its file, its exact text and why; an
// entry that no longer matches anything fails too, so the list never rots.
// =============================================================================
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const OLD = /\bfrata\b/i
const ALLOW_FILE = 'scripts/check-name.allow.json'

/** Every readable string in one file, as { text, line }. */
export function strings(source, fileName = 'x.tsx') {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const out = []
  const visit = (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n) || ts.isJsxText(n)) {
      const text = ts.isJsxText(n) ? n.getText(sf) : n.text
      // An import or export path is code, not words.
      if (!(ts.isStringLiteral(n) && (ts.isImportDeclaration(n.parent) || ts.isExportDeclaration(n.parent) || ts.isExternalModuleReference(n.parent)))) {
        out.push({ text, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1 })
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

/** Old-name hits in one file's text: [{ line, text }]. */
export function check(source, fileName) {
  return strings(source, fileName).filter((s) => OLD.test(s.text)).map((s) => ({ line: s.line, text: s.text.trim() }))
}

/** Hits against the allow-list: what fails, and allow entries nothing used (they fail too, so the list never rots). */
export function judge(hits, allow) {
  const used = new Set(), problems = []
  for (const h of hits) {
    const i = allow.findIndex((a) => a.file === h.file && a.text === h.text)
    if (i >= 0) used.add(i); else problems.push(`${h.file}:${h.line}  "${h.text.slice(0, 80)}"`)
  }
  allow.forEach((a, i) => { if (!used.has(i)) problems.push(`${ALLOW_FILE}: unused entry ${a.file} "${a.text}" (remove it)`) })
  return problems
}

function walk(p, acc = []) {
  if (!existsSync(p)) return acc
  if (statSync(p).isDirectory()) { for (const e of readdirSync(p)) if (e !== '__tests__' && e !== 'node_modules') walk(join(p, e), acc); return acc }
  if (/\.(tsx?|mjs)$/.test(p)) acc.push(p)
  return acc
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = process.argv[2]
  const allow = existsSync(ALLOW_FILE) && !target ? JSON.parse(readFileSync(ALLOW_FILE, 'utf8')) : []
  const hits = walk(target ?? 'src').flatMap((f) => { const file = relative('.', f).replaceAll('\\', '/'); return check(readFileSync(f, 'utf8'), f).map((h) => ({ ...h, file })) })
  const problems = judge(hits, allow)
  if (problems.length) { console.error(`check:name — the product is "Frrata"; ${problems.length} old-name string(s):\n  ${problems.join('\n  ')}`); process.exit(1) }
  console.log(`check:name — clean (${allow.length} internal names allowed, each with its reason)`)
}
