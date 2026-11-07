#!/usr/bin/env node
// =============================================================================
// FILE: scripts/check-motion.mjs — `node scripts/check-motion.mjs [path]`
//
// Fails: motion that breaks frata-design-language § UX foundation rules 22–29
// in Console, Admin, the partner workspace and the sign-in pages (the shop
// has its own motion):
//   layout      a transition of a property that reflows the page (width,
//               height, top/left/right/bottom, inset, margin, padding, gap,
//               flex-basis, grid-template-*, font-size), or of `all` (it would
//               include them): Tailwind transition-[…]/transition-all, an
//               inline style, or CSS transition/transition-property
//   arbitrary   duration-[…], ease-[…], delay-[…] or animate-[…] (use the
//               tokens), or a Tailwind duration-N over 400
//   keyframes   an @keyframes in CSS that animates anything but opacity,
//               transform, scale, translate or rotate; a named exception may
//               animate only the properties it lists
//   too-long    a CSS animation, animation-duration or transition-duration
//               over 400 ms; a named exception may run to its own limit
// Comment lines are skipped (CSS block comments are stripped), so this header
// never trips the gate.
// =============================================================================
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

const DIRS = ['src/app/(console)', 'src/app/(admin)', 'src/app/(partner)', 'src/app/login', 'src/app/start', 'src/app/choose', 'src/app/handover', 'src/app/partners',
  'src/components/shell', 'src/components/brand', 'src/components/icons', 'src/components/data', 'src/components/layout', 'src/components/nav', 'src/components/ui', 'src/app/globals.css']
const MOVING = ['opacity', 'transform', 'scale', 'translate', 'rotate']
const LIMIT_MS = 400
/** Keyframes allowed to animate something else, or for longer than 400 ms: what each may animate, for how long, and why. */
export const EXCEPTIONS = {
  'value-flash': { props: ['background-color'], ms: 800, why: 'a changed value flashes its background once (Phase 1 motion rule): colour, no layout' },
  draw: { props: ['stroke-dashoffset'], ms: LIMIT_MS, why: 'the one brand moment, a check drawn once (rule 26): stroke-dashoffset is paint only' },
  'nav-run': { props: [], ms: 1400, why: 'the progress bar creeping while a move is on its way; it is interrupted when the page lands' },
  'undo-window': { props: [], ms: 8000, why: 'the 8 s Undo window, shown as a shrinking bar (1D, § Work queues 4)' },
}
const LAYOUT = /(?:^|[\s,_'"`])(?:all|(?:max-|min-)?(?:width|height)|top|left|right|bottom|inset(?:-[\w-]+)?|margin(?:-[\w-]+)?|padding(?:-[\w-]+)?|gap|row-gap|column-gap|flex-basis|flex|grid-template-(?:rows|columns)|font-size|line-height)(?=$|[\s,_;'"`])/
const KEYWORDS = new Set(['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'step-start', 'step-end', 'infinite', 'both', 'forwards', 'backwards', 'none', 'normal', 'reverse', 'alternate', 'alternate-reverse', 'running', 'paused', 'initial', 'inherit', 'unset'])
const isComment = (l) => { const t = l.trim(); return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*') }
const noVars = (v) => v.replace(/var\([^)]*\)/g, ' ')
const ms = (t) => { const m = /^([\d.]+)(ms|s)$/.exec(t); return m ? Number(m[1]) * (m[2] === 's' ? 1000 : 1) : null }
/** Split at top-level commas (not inside parentheses). */
const layers = (v) => { const out = []; let depth = 0, cur = ''; for (const c of v) { if (c === '(') depth++; if (c === ')') depth--; if (c === ',' && !depth) { out.push(cur); cur = '' } else cur += c } return [...out, cur] }
/** Tokens at the top level of one layer: functions such as cubic-bezier(…) and var(…) are dropped. */
const tokens = (layer) => layer.replace(/[\w-]+\([^)]*\)/g, ' ').trim().split(/\s+/).filter(Boolean)

function walk(p, acc = []) {
  if (!existsSync(p)) return acc
  if (!statSync(p).isDirectory()) { if (/\.(tsx?|css)$/.test(p)) acc.push(p); return acc }
  for (const e of readdirSync(p)) walk(join(p, e), acc)
  return acc
}

/** Problems in one file's text, as "rule: what". */
export function check(text, isCss) {
  const problems = []
  if (!isCss) {
    for (const line of text.split(/\r?\n/)) {
      if (isComment(line)) continue
      for (const m of line.matchAll(/\btransition-\[([^\]]+)\]/g)) if (LAYOUT.test(' ' + m[1].replace(/_/g, ' '))) problems.push(`layout: transition-[${m[1]}]`)
      if (/\btransition-(?:all)\b/.test(line)) problems.push('layout: transition-' + 'all')
      for (const m of line.matchAll(/\btransition(?:Property)?\s*:\s*(['"`])([^'"`]*)\1/g)) if (LAYOUT.test(' ' + noVars(m[2]))) problems.push(`layout: style transition '${m[2].slice(0, 60)}'`)
      for (const m of line.matchAll(/\b(duration|ease|delay|animate)-\[[^\]]*\]/g)) problems.push(`arbitrary: ${m[0]}`)
      for (const m of line.matchAll(/\bduration-(\d+)\b/g)) if (Number(m[1]) > LIMIT_MS) problems.push(`arbitrary: ${m[0]} (use duration-fast|base|slow)`)
    }
    return problems
  }
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '')
  // Declarations read whole: across lines, and to the next ; or } (a last declaration may have no ;).
  for (const m of code.matchAll(/(?<![\w-])(transition|transition-property|transition-duration|animation|animation-duration)\s*:\s*([^;{}]+)/g)) {
    const [, prop, value] = m
    if (prop === 'transition' || prop === 'transition-property') {
      const v = noVars(value)
      if (!/^\s*none\b/.test(v) && LAYOUT.test(' ' + v)) problems.push(`layout: ${prop}: ${value.trim().replace(/\s+/g, ' ').slice(0, 60)}`)
      if (prop === 'transition') for (const l of layers(value)) { const t = tokens(l).map(ms).find((x) => x != null); if (t != null && t > LIMIT_MS) problems.push(`too-long: transition ${l.trim()} (nothing over ${LIMIT_MS} ms)`) }
    } else if (prop === 'transition-duration' || prop === 'animation-duration') {
      for (const t of tokens(value)) { const n = ms(t.replace(/!important/, '')); if (n != null && n > LIMIT_MS) problems.push(`too-long: ${prop}: ${t} (nothing over ${LIMIT_MS} ms)`) }
    } else {
      for (const l of layers(value)) {
        const ts = tokens(l), name = ts.find((t) => ms(t) == null && !KEYWORDS.has(t) && !/^[\d.]+$/.test(t) && t !== '!important') ?? '?'
        const d = ts.map(ms).find((x) => x != null)
        const max = EXCEPTIONS[name]?.ms ?? LIMIT_MS
        if (d != null && d > max) problems.push(`too-long: ${name} ${d}ms (${name in EXCEPTIONS ? `its limit is ${max} ms` : `nothing over ${LIMIT_MS} ms`})`)
      }
    }
  }
  for (const m of code.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)) {
    const [, name, body] = m
    const allowed = [...MOVING, ...(EXCEPTIONS[name]?.props ?? [])]
    for (const prop of new Set([...body.matchAll(/([\w-]+)\s*:/g)].map((d) => d[1]))) if (!allowed.includes(prop)) problems.push(`keyframes: ${name} animates ${prop}`)
  }
  return problems
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = process.argv[2]
  if (target && !existsSync(target)) { console.error(`check:motion — no such path: ${target}`); process.exit(2) }
  const files = (target ? [target] : DIRS).flatMap((d) => walk(d))
  const problems = files.flatMap((f) => check(readFileSync(f, 'utf8'), f.endsWith('.css')).map((p) => `${relative('.', f)}  ${p}`))
  if (problems.length) { console.error(`check:motion — frata-design-language § UX foundation 22–29:\n  ${problems.join('\n  ')}`); process.exit(1) }
  console.log(`check:motion — clean (${files.length} files)`)
}
