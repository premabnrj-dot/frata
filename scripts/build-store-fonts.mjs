#!/usr/bin/env node
// =============================================================================
// FILE: scripts/build-store-fonts.mjs — writes src/components/shop-preview/store-fonts.css, the eight theme faces
// (`npm run build:store-fonts`); `--check` (in the gates) fails if the committed file differs from what it would write.
//
// Why a stylesheet and not next/font (page weight 2026-11-23, the owner's go "only if nothing a shopper sees changes"):
// each localFont() call leaves a small JS object ({className, style, variable}) in every shop page's first load although
// only the server reads it, 0.28 kB gzipped on a theme shop page. This script runs next/font's OWN local loader and its
// OWN postcss plugin (the two steps next-font-loader runs) on the same options, so every @font-face (src, display,
// weight, unicode-range), every fallback face (its local() font and its ascent/descent/line-gap/size overrides) and every
// variable's value is what next/font writes, to the character. Only the font files' URLs (resolved by css-loader at
// build, as any url()) and the class name differ. None of these faces is preloaded (preload: false below and before),
// so no <link rel=preload> is lost. Inter and DM Sans ARE preloaded and stay on next/font (src/app/layout.tsx,
// src/components/brand/site-fonts.ts), as do the brand record's faces (brand-fonts.ts).
//
// The options below moved here unchanged from fonts.ts (with their reasons). Change a face here, then run
// `npm run build:store-fonts` and commit both files.
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve as resolvePath } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'package.json'))
// next/font's internals (Next 15.5): its local loader and its postcss plugin, the two steps next-font-loader runs.
let loader, nextFontPostcss, postcss
try {
  loader = require('next/dist/compiled/@next/font/dist/local/loader.js').default
  nextFontPostcss = require('next/dist/build/webpack/loaders/next-font-loader/postcss-next-font.js').default
  postcss = require('postcss')
  if (typeof loader !== 'function' || typeof nextFontPostcss !== 'function') throw new Error('not functions')
} catch (e) {
  console.error(`store-fonts: next/font's loader moved in this Next (${require('next/package.json').version}): ${e instanceof Error ? e.message.split('\n')[0] : e}.\n` +
    '  This script reads Next 15.5\'s internal files. Point it at their new paths, or put the eight faces back as localFont() calls\n' +
    '  in src/components/shop-preview/fonts.ts (their options are below) and drop the generated stylesheet\n' +
    '  (docs/plans/2026-11-23-page-weight.md § After the release).')
  process.exit(1)
}

const DIR = 'src/components/shop-preview' // where the faces' paths are resolved from, as fonts.ts did
const OUT = join(DIR, 'store-fonts.css')
/** The class that sets the eight variables (STORE_FONT_VARS in fonts.ts). */
export const STORE_FONTS_CLASS = 'store-fonts'

/** [variableName, localFont options]: a shop's display faces (themes spec § Theme settings › Pairing; body is Inter). */
const FACES = [
  // Latin only. None is preloaded (speed review P6): every shop page preloaded Fraunces and Cormorant whichever face it
  // used, ahead of its main photo; a face downloads when the page uses it. Self-hosted (src/components/fonts/, OFL 1.1,
  // from Fontsource 5.3.0, 2026-11-11).
  ['fraunces', { src: [{ path: '../fonts/fraunces/fraunces-latin-500-normal.woff2', weight: '500' }, { path: '../fonts/fraunces/fraunces-latin-600-normal.woff2', weight: '600' }], display: 'swap', preload: false, variable: '--font-store-fraunces' }],
  ['cormorant', { src: [{ path: '../fonts/cormorant-garamond/cormorant-garamond-latin-500-normal.woff2', weight: '500' }, { path: '../fonts/cormorant-garamond/cormorant-garamond-latin-600-normal.woff2', weight: '600' }], display: 'swap', preload: false, variable: '--font-store-cormorant' }],
  ['playfair', { src: [{ path: '../fonts/playfair-display/playfair-display-latin-500-normal.woff2', weight: '500' }, { path: '../fonts/playfair-display/playfair-display-latin-600-normal.woff2', weight: '600' }], display: 'swap', preload: false, variable: '--font-store-playfair' }],
  ['dmserif', { src: '../fonts/dm-serif-display/dm-serif-display-latin-400-normal.woff2', weight: '400', display: 'swap', preload: false, variable: '--font-store-dmserif' }],
  // Theme Signal (speed review 2026-11-09): one weight. Latin, and latin-ext for ₹ as its own face with its own range,
  // so its file loads only where a ₹ is on the page.
  ['schibsted', { src: '../fonts/schibsted-grotesk/schibsted-grotesk-latin-600-normal.woff2', weight: '600', display: 'swap', preload: false, variable: '--font-store-schibsted',
    declarations: [{ prop: 'unicode-range', value: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD' }] }],
  ['schibstedExt', { src: '../fonts/schibsted-grotesk/schibsted-grotesk-latin-ext-600-normal.woff2', weight: '600', display: 'swap', preload: false, adjustFontFallback: false, variable: '--font-store-schibsted-ext',
    declarations: [{ prop: 'unicode-range', value: 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF' }] }],
  // Hindi shop words (themes T2): the console's self-hosted Noto Sans Devanagari, used only under [lang="hi"]
  // (globals.css) and never preloaded, so an English shop never downloads it.
  ['deva', { src: '../shell/noto/noto-sans-devanagari-devanagari-wght-normal.woff2', weight: '100 900', preload: false, adjustFontFallback: false, display: 'swap', variable: '--font-store-deva',
    declarations: [{ prop: 'unicode-range', value: 'U+0900-097F,U+1CD0-1CF9,U+200C-200D,U+25CC,U+A830-A839,U+A8E0-A8FF' }] }],
  // Signal 1.2 (S2): Caveat 700 for the Hero's script line and the Statement's wordmark. Self-hosted, ASCII only and
  // without its contextual alternates (owner, 2026-11-09: 19.5 kB, not Google's 51 kB); OFL 1.1, no Reserved Font Name
  // (./caveat/OFL.txt). Not preloaded: a page fetches it only when it shows a script line. Other characters fall back
  // to the grotesk, never to a system "cursive".
  ['script', { src: './caveat/caveat-700-ascii.woff2', weight: '700', preload: false, display: 'swap', variable: '--font-store-script', fallback: ['var(--store-display)'] }],
]

/** next/font's output for one face, as next-font-loader composes it: the loader, then the postcss plugin. */
async function face(variableName, options) {
  const byBuffer = new Map()
  const fs = { readFile: (p, cb) => { try { const b = readFileSync(p); byBuffer.set(b, p); cb(null, b) } catch (e) { cb(e) } } }
  const out = await loader({
    functionName: '', variableName, data: [options], isDev: false, isServer: false, loaderContext: { fs },
    resolve: async (src) => resolvePath(ROOT, DIR, src),
    // The url css-loader resolves at build: the font file, relative to the stylesheet.
    emitFontFile: (buffer) => relative(join(ROOT, DIR), byBuffer.get(buffer)).replaceAll('\\', '/'),
  })
  const exports = []
  const result = await postcss([nextFontPostcss({ exports, fallbackFonts: out.fallbackFonts, weight: out.weight, style: out.style, adjustFontFallback: out.adjustFontFallback, variable: out.variable })]).process(out.css, { from: undefined })
  const faces = result.root.nodes.filter((n) => n.type === 'atrule' && n.name === 'font-face').map((n) => n.toString())
  const variable = result.root.nodes.find((n) => n.type === 'rule' && n.selector === '.variable')?.nodes?.[0]
  return { faces, variable: variable ? `${variable.prop}: ${variable.value};` : null }
}

export async function storeFontsCss() {
  const parts = await Promise.all(FACES.map(([name, options]) => face(name, options)))
  return [
    ['/* GENERATED by scripts/build-store-fonts.mjs from next/font\'s own loader — do not edit; change the faces there and run',
      '   `npm run build:store-fonts`. The eight theme faces of a shop (page weight 2026-11-23: a stylesheet leaves no JS',
      '   object in a page\'s first load, as next/font did). None is preloaded. */'].join('\n'),
    ...parts.flatMap((p) => p.faces),
    `.${STORE_FONTS_CLASS} {\n${parts.map((p) => p.variable).filter(Boolean).map((d) => `  ${d}`).join('\n')}\n}`,
    '',
  ].join('\n\n').replace(/\n{3,}/g, '\n\n')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolvePath(process.argv[1])) {
  const css = await storeFontsCss()
  const path = join(ROOT, OUT)
  if (process.argv.includes('--check')) {
    let now = ''
    try { now = readFileSync(path, 'utf8') } catch { /* missing */ }
    if (now !== css) { console.error(`check:store-fonts — ${OUT} is not what scripts/build-store-fonts.mjs writes (a face's options or file changed): run npm run build:store-fonts and commit it`); process.exit(1) }
    console.log(`check:store-fonts — clean (${FACES.length} faces, generated by next/font's loader)`)
  } else {
    writeFileSync(path, css)
    console.log(`wrote ${OUT} (${FACES.length} faces)`)
  }
}
