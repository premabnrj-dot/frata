#!/usr/bin/env node
// =============================================================================
// FILE: scripts/check-contrast.mjs — `node scripts/check-contrast.mjs [css]`
//
// Fails: a colour token pair below WCAG 2.2 AA, in light OR dark.
//
// Reads the token blocks of src/app/base.css (`:root, [data-neel] [data-store-theme] {` and
// `:root[data-theme="dark"] {`) and src/app/neel.css (`[data-neel] {`), resolves var(), and checks
// three themes: light, Neel (light over-written by the console's tokens) and dark:
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
const SURFACES = ['background', 'card', 'popover', 'primary', 'secondary', 'muted', 'accent', 'destructive', 'brand', 'support', 'ink', 'bar']
const STATUS = ['ok', 'warn', 'danger', 'info', 'neutral']
/** Tokens that are not read as text or as an edge a person must see, with why. */
const DECORATIVE = {
  // Neel (the console's tokens, [data-neel]):
  'line-soft': 'Neel: the soft rule between rows; never the only sign of a control',
  edge: "Neel: a secondary button's edge; the button is known by its words and its e1 shadow",
  halo: 'Neel: the 3 px ring outside a focused or wrong field; the 2 px focus line and the field edge carry the meaning',
  'chart-now': 'Neel: the period still running, beside --chart; its number is in the label and the tooltip',
  'ek-line': 'EkCode pages: separates content (cards, rules); never the only sign of a control',
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
  // The website (Rani Mela): shapes and rules that carry no words.
  'site-rani-tint': 'website: a soft rani circle behind the hero; never text',
  'site-line': 'website: separates content (cards, order lines); never the only sign of a control',
  'site-edge': "website: a ghost button's edge; the button is known by its words",
  'site-peacock': 'website: the tick mark in a toast and the plan list; the words beside say the same',
  'site-rani-press': 'website: the pressed rani button; its words stay white (checked against --site-rani)',
  'site-neel-deep': 'website: the shape inside the neel band; nothing is read on it',
}

export function pairs() {
  const p = []
  for (const s of SURFACES) p.push([`${s}-foreground`, s, TEXT])
  for (const s of STATUS) p.push([`${s}-text`, s, TEXT])
  p.push(['foreground', 'background', TEXT], ['muted-foreground', 'background', TEXT], ['muted-foreground', 'card', TEXT],
    ['danger-text', 'card', TEXT], ['brand', 'card', TEXT] /* the mark (rani) on a card, held to text contrast though it is a logo */,
    ['destructive', 'popover', TEXT], ['destructive', 'accent', TEXT] /* a danger item in a menu, and hovered */,
    // Rani as words (brand spec): only --brand-text, on every surface words sit on.
    ['brand-text', 'background', TEXT], ['brand-text', 'card', TEXT], ['brand-text', 'muted', TEXT], ['brand-text', 'accent', TEXT],
    // The website's Neel band: paper numbers and words on it (website spec W·1); rani on the ink stage.
    ['primary-foreground', 'neel', TEXT], ['brand-on-ink', 'ink', TEXT])
  // EkCode's own brand (frata-design-language § EkCode): words on paper and on ink, the cursor on both.
  p.push(['ek-ink', 'ek-paper', TEXT], ['ek-paper', 'ek-ink', TEXT], ['ek-sub', 'ek-paper', TEXT], ['ek-cursor', 'ek-paper', NONTEXT], ['ek-cursor-on-ink', 'ek-ink', NONTEXT])
  p.push(['input', 'card', NONTEXT], ['input', 'background', NONTEXT], ['ring', 'background', NONTEXT], ['ring', 'card', NONTEXT],
    ['primary-foreground', 'primary', NONTEXT] /* the focus ring on ink */,
    // The thread under a primary (ink) or secondary (card) button, the current tab, the loading bar; the tinge on ink.
    ['thread', 'ink', NONTEXT], ['thread', 'card', NONTEXT], ['thread', 'background', NONTEXT], ['thread', 'accent', NONTEXT] /* the current view tab */, ['brand-on-ink', 'ink', NONTEXT])
  // The support banner's ring and its End now button (white on amber) are support-foreground/support, a text pair above.
  for (const s of ['ok', 'warn', 'danger', 'info']) p.push([`${s}-mark`, 'card', NONTEXT], [`${s}-mark`, 'background', NONTEXT])
  // Neel only (each pair is checked where both tokens exist, so in the Neel theme).
  p.push(['primary-foreground', 'primary-hover', TEXT], ['link', 'background', TEXT], ['link', 'card', TEXT], ['link', 'sunk', TEXT],
    ['select-foreground', 'select', TEXT], ['foreground', 'select', TEXT], ['foreground', 'sunk', TEXT], ['muted-foreground', 'sunk', TEXT],
    ['foreground', 'side', TEXT], ['muted-foreground', 'side', TEXT], ['bar-btn-text', 'bar-btn', TEXT], ['bar-link', 'bar', TEXT],
    ['text-3', 'card', NONTEXT] /* icons; never a sentence */, ['off', 'card', NONTEXT], ['neutral-mark', 'card', NONTEXT],
    ['chart', 'card', NONTEXT], ['ring', 'select', NONTEXT], ['input', 'sunk', NONTEXT], ['field-hover', 'card', NONTEXT])
  // Neel N1b: words on a heat or a tile map cell (a cohort's %, a state's code), dark on the light half, white on the dark.
  for (const i of [0, 1, 2, 3]) p.push(['foreground', `heat-${i}`, TEXT], ['risk-text', `risk-${i}`, TEXT])
  for (const i of [4, 5]) p.push(['heat-on', `heat-${i}`, TEXT], ['risk-on', `risk-${i}`, TEXT])
  // The website (Rani Mela): every word on every surface it sits on.
  for (const bg of ['site-paper', 'site-paper-2']) p.push(['site-ink', bg, TEXT], ['site-ink-2', bg, TEXT], ['site-muted', bg, TEXT], ['site-rani', bg, TEXT], ['site-neel', bg, TEXT], ['site-peacock-text', bg, TEXT])
  p.push(['site-on-strong', 'site-rani', TEXT], ['site-on-strong', 'site-rani-press', TEXT], ['site-on-strong', 'site-neel', TEXT], ['site-on-strong', 'site-neel-night', TEXT], ['site-on-strong', 'site-peacock-text', TEXT],
    ['site-on-neel-2', 'site-neel', TEXT], ['site-on-neel-2', 'site-neel-night', TEXT], ['site-rani-deep', 'site-on-strong', TEXT],
    ['site-rani-deep', 'site-rani-soft', TEXT], ['site-ink-2', 'site-rani-soft', TEXT], ['site-neel', 'site-neel-soft', TEXT], ['site-ink-2', 'site-neel-soft', TEXT],
    ['site-peacock-text', 'site-peacock-soft', TEXT], ['site-marigold-text', 'site-marigold-soft', TEXT], ['site-ink', 'site-marigold', TEXT],
    ['site-on-strong', 'site-neel-deep', TEXT])
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
  const light = block(css, ':root, [data-neel] [data-store-theme] {')
  if (!light) return ['no `:root, [data-neel] [data-store-theme] {` block']
  const neel = block(css, '[data-neel] {')
  const dark = block(css, ':root[data-theme="dark"] {')
  const themes = [['light', light]]
  if (neel) themes.push(['neel', { ...light, ...neel }])
  if (dark) {
    themes.push(['dark', { ...light, ...dark }])
  }
  const colour = (t, k, seen = new Set()) => {
    const v = t[k]
    if (v === undefined) return null
    const ref = v.match(/^var\(--([a-z0-9-]+)\)$/)
    if (ref) { if (seen.has(k)) return null; seen.add(k); return colour(t, ref[1], seen) }
    return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) ? v : null
  }
  // Colour tokens only (radius, depth and type are the same in both modes).
  if (dark) for (const k of Object.keys(light)) if (colour(light, k) && !(k in dark)) problems.push(`dark: --${k} is not defined (it would fall back to the light value)`)
  // The website (Rani Mela) and EkCode look the same in both modes: their dark values must equal the light ones.
  if (dark) for (const k of Object.keys(light)) if (/^(site|ek)-/.test(k) && k in dark && light[k] !== dark[k]) problems.push(`dark: --${k} differs from light (${dark[k]} vs ${light[k]}); this look is the same in both modes`)
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
  const all = { ...light, ...neel }
  for (const k of Object.keys(all)) if (colour(all, k) && !used.has(k)) problems.push(`--${k} is a colour in no pair: add its pair to scripts/check-contrast.mjs or a reason to DECORATIVE`)
  return problems
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // The tokens: base.css (light and dark) and neel.css (the console's), read as one text.
  const files = process.argv[2] ? [process.argv[2]] : ['src/app/base.css', 'src/app/neel.css']
  const file = files.join(' + ')
  for (const f of files) if (!existsSync(f)) { console.error(`check:contrast — no such file: ${f}`); process.exit(2) }
  const problems = check(files.map((f) => readFileSync(f, 'utf8')).join('\n'))
  if (problems.length) { console.error(`check:contrast — ${file}\n  ${problems.join('\n  ')}`); process.exit(1) }
  console.log(`check:contrast — clean (${pairs().length} pairs, light, Neel and dark)`)
}
