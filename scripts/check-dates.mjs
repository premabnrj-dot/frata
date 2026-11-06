#!/usr/bin/env node
// Fails: a date formatted with no `timeZone`, which reads in UTC on Vercel (`src/lib/format-date.ts` is the one way).
//
// A moment formatted with no time zone is a moment in UTC: pages render on
// Vercel, whose clock is UTC, so "submitted 5:03 pm" was 10:33 pm in India
// (quote page redesign, 2026-10-12, Q6). This fails any date formatting call
// — toLocaleDateString, toLocaleTimeString, Intl.DateTimeFormat, or a
// toLocaleString given date or time fields — that names no timeZone.
// src/lib/format-date.ts is the one way to say it (dayIN, dayMonthIN,
// dateTimeIN, IST).
//
// A number's toLocaleString (₹ grouping) has no date fields and passes.
// Follows check-motion.mjs: paths normalised to forward slashes, a call read
// to its closing bracket so options over several lines count, and a call on
// a comment line skipped — so this file's own words do not fail it.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const CALL = /\b(toLocaleDateString|toLocaleTimeString|toLocaleString|DateTimeFormat)\s*\(/g
const DATE_FIELDS = /\b(day|month|year|hour|minute|weekday|dateStyle|timeStyle)\s*:/

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) acc.push(p)
  }
  return acc
}

/** The call's text, from its name to its closing bracket. */
function callAt(src, start, open) {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++
    else if (src[i] === ')' && --depth === 0) return src.slice(start, i + 1)
  }
  return src.slice(start)
}

let failures = 0
for (const file of walk('src')) {
  const rel = relative('.', file).replaceAll('\\', '/')
  const src = readFileSync(file, 'utf8')
  const lines = src.split(/\r?\n/)
  for (const m of src.matchAll(CALL)) {
    const lineNo = src.slice(0, m.index).split('\n').length
    const line = lines[lineNo - 1].trim()
    if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) continue
    const call = callAt(src, m.index, m.index + m[0].length - 1)
    if (/\btimeZone\b/.test(call)) continue
    if (m[1] === 'toLocaleString' && !DATE_FIELDS.test(call)) continue
    console.error(`${rel}:${lineNo}  ${call.replace(/\s+/g, ' ').slice(0, 100)}`)
    failures++
  }
}

if (failures) {
  console.error(
    `\n${failures} date(s) formatted with no time zone — they would read in UTC.\n` +
    `  Use dayIN, dayMonthIN, dayMonthLongIN or dateTimeIN from src/lib/format-date.ts,\n` +
    `  or pass timeZone: IST.`,
  )
  process.exit(1)
}
console.log('check:dates — clean')
