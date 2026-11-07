#!/usr/bin/env node
// =============================================================================
// FILE: scripts/check-contrast.mjs — `node scripts/check-contrast.mjs [css]`
//
// Fails: a colour token pair below WCAG 2.2 AA, in light OR dark.
//
// Reads the token blocks of src/app/globals.css (`:root {` and
// `:root[data-theme="dark"] {`), resolves var(), and checks:
//   text      ≥ 4.5:1 — every X / X-foreground and X / X-text pair, body,
//                        secondary text on every surface, the reversed mark;
//   non-text  ≥ 3:1   — the field edge, the focus ring, the status marks.
// Every colour token must be in a pair or in DECORATIVE with its reason, so a
// new token cannot skip the check. Store theme tokens ([data-store-theme]) are
// the storefront's and are not read (frata-design-language § Storefront).
// A dark block is optional; when present, it must define every light token.
// Alpha is not read: every token is opaque hex (a token with alpha fails as "not a hex colour").
// =============================================================================
import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const TEXT = 4.5, NONTEXT = 3
const SURFACES = ['background', 'card', 'popover', 'primary', 'secondary', 'muted', 'accent', 'destructive', 'brand', 'support']
const STATUS = ['ok', 'warn', 'danger', 'info', 'neutral']
/** Tokens that are not read as text or as an edge a person must see, with why. */
const DECORATIVE = {
  border: 'separates content (cards, table rules); never the only sign of a control (rule 2)',
  scrim: 'the veil behind an open dialog (the ink at 45%); nothing is read on it',
  // Illustration (frata-design-language § Graphic language): aria-hidden, the same words always beside them.
  'illo-line': 'pictogram and illustration strokes; decorative, the meaning is in the text beside',
  'illo-paper': 'illustration paper',
  'illo-fill': 'illustration warm fill',
  'illo-haldi': 'illustration accent',
  'illo-haldi-soft': 'illustration accent, pale',
  'illo-indigo-soft': 'illustration second accent, pale',
  // Brand-surface companions (brand spec 2026-11-07): sign-in, the website, drawings. Never text, never a control.
  haldi: 'brand-surface highlight (and the illustration accent); never text or a control',
  neel: 'brand-surface depth (block-print pattern); never text or a control',
}

export function pairs() {
  const p = []
  for (const s of SURFACES) p.push([`${s}-foreground`, s, TEXT])
  for (const s of STATUS) p.push([`${s}-text`, s, TEXT])
  p.push(['foreground', 'background', TEXT], ['muted-foreground', 'background', TEXT], ['muted-foreground', 'card', TEXT],
    ['danger-text', 'card', TEXT], ['brand', 'card', TEXT] /* the reversed mark: oxblood letter on a paper tile */,
    ['destructive', 'popover', TEXT], ['destructive', 'accent', TEXT] /* a danger item in a menu, and hovered */,
    // Rani as words (brand spec): only --brand-text, on every surface words sit on.
    ['brand-text', 'background', TEXT], ['brand-text', 'card', TEXT], ['brand-text', 'muted', TEXT], ['brand-text', 'accent', TEXT])
  p.push(['input', 'card', NONTEXT], ['input', 'background', NONTEXT], ['ring', 'background', NONTEXT], ['ring', 'card', NONTEXT],
    ['primary-foreground', 'primary', NONTEXT] /* the focus ring on ink */,
    // The thread under a primary (ink) or secondary (card) button, the current tab, the loading bar; the tinge on ink.
    ['thread', 'primary', NONTEXT], ['thread', 'card', NONTEXT], ['thread', 'background', NONTEXT], ['brand-on-ink', 'primary', NONTEXT])
  // The support banner's ring and its End now button (white on amber) are support-foreground/support, a text pair above.
  for (const s of ['ok', 'warn', 'danger', 'info']) p.push([`${s}-mark`, 'card', NONTEXT], [`${s}-mark`, 'background', NONTEXT])
  return p
}

function block(css, selector) {
  const at = css.indexOf(selector)
  if (at < 0) return null
  const open = css.indexOf('{', at), close = css.indexOf('}', open)
  const tokens = {}
  for (const m of css.slice(open + 1, close).matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) tokens[m[1]] = m[2].trim()
  return tokens
}
const lum = (hex) => {
  const h = hex.replace('#', ''), full = h.length === 3 ? [...h].map((c) => c + c).join('') : h.slice(0, 6)
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0)
}
export const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

/** Problems in one css text, as sentences. */
export function check(css) {
  const problems = []
  const light = block(css, ':root {')
  if (!light) return ['no :root { block']
  const dark = block(css, ':root[data-theme="dark"] {')
  const themes = [['light', light]]
  if (dark) {
    themes.push(['dark', { ...light, ...dark }])
    for (const k of Object.keys(light)) if (/^#|var\(/.test(light[k]) && !(k in dark)) problems.push(`dark: --${k} is not defined (it would fall back to the light value)`)
  }
  const colour = (t, k, seen = new Set()) => {
    const v = t[k]
    if (v === undefined) return null
    const ref = v.match(/^var\(--([a-z0-9-]+)\)$/)
    if (ref) { if (seen.has(k)) return null; seen.add(k); return colour(t, ref[1], seen) }
    return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) ? v : null
  }
  const used = new Set(Object.keys(DECORATIVE))
  for (const [name, t] of themes) {
    for (const [fg, bg, need] of pairs()) {
      if (!(fg in t) || !(bg in t)) continue
      used.add(fg); used.add(bg)
      const a = colour(t, fg), b = colour(t, bg)
      if (!a || !b) { problems.push(`${name}: --${fg} / --${bg} is not a hex colour`); continue }
      const r = ratio(a, b)
      if (r < need) problems.push(`${name}: --${fg} on --${bg} is ${r.toFixed(2)}:1, needs ${need}:1`)
    }
  }
  for (const k of Object.keys(light)) if (colour(light, k) && !used.has(k)) problems.push(`--${k} is a colour in no pair: add its pair to scripts/check-contrast.mjs or a reason to DECORATIVE`)
  return problems
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2] ?? 'src/app/globals.css'
  if (!existsSync(file)) { console.error(`check:contrast — no such file: ${file}`); process.exit(2) }
  const problems = check(readFileSync(file, 'utf8'))
  if (problems.length) { console.error(`check:contrast — ${file}\n  ${problems.join('\n  ')}`); process.exit(1) }
  console.log(`check:contrast — clean (${pairs().length} pairs, light and dark)`)
}
