// =============================================================================
// GATE (postbuild): every route that makes a PDF ships what React-PDF loads at run time.
//
// Vercel runs a function from the files Next traced for it, nothing else. pdfkit loads its standard fonts through its
// package "imports" map ('#standard-fonts/Helvetica'), which the tracer does not follow: locally the file is on disk,
// so every test passes, and in production every PDF failed with MODULE_NOT_FOUND (2026-11-08, "it downloads pdf.txt").
// This copies ONLY a route's traced node_modules and our fonts into an empty folder and renders a PDF there, with
// Helvetica and the vendored faces, the way the function will. Fix a failure in next.config outputFileTracingIncludes.
// =============================================================================
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const ROUTES = ['.next/server/app/(console)/console/orders/pdf/route.js', '.next/server/app/api/shop/orders/invoice/route.js']
let failed = false

for (const route of ROUTES) {
  const nft = join(ROOT, `${route}.nft.json`)
  if (!existsSync(nft)) { console.error(`check:pdf-trace — ${route} was not built`); failed = true; continue }
  const base = dirname(join(ROOT, route))
  const files = JSON.parse(readFileSync(nft, 'utf8')).files.map((f) => relative(ROOT, resolve(base, f)))
  const need = ['node_modules/pdfkit/js/standard-fonts/Helvetica.cjs', 'src/lib/documents/fonts/inter-latin-400-normal.woff', 'src/lib/documents/fonts/noto-sans-devanagari-devanagari-400-normal.woff']
  const missing = need.filter((n) => !files.includes(n))
  if (missing.length) { console.error(`check:pdf-trace — ${route} does not ship: ${missing.join(', ')}`); failed = true; continue }
  // Render in a folder holding only the traced files.
  const box = mkdtempSync(join(tmpdir(), 'pdf-trace-'))
  try {
    for (const f of files) {
      if (!f.startsWith('node_modules/') && !f.startsWith('src/lib/documents/fonts/')) continue
      mkdirSync(dirname(join(box, f)), { recursive: true })
      cpSync(join(ROOT, f), join(box, f), { dereference: true })
    }
    writeFileSync(join(box, 'render.mjs'), `
      import { createElement as h } from 'react'
      import { Document, Page, Text, Font, renderToBuffer } from '@react-pdf/renderer'
      Font.register({ family: 'Inter', src: 'src/lib/documents/fonts/inter-latin-400-normal.woff' })
      Font.register({ family: 'Noto', src: 'src/lib/documents/fonts/noto-sans-devanagari-devanagari-400-normal.woff' })
      const doc = h(Document, null, h(Page, null, h(Text, null, 'Helvetica'), h(Text, { style: { fontFamily: ['Inter', 'Noto'] } }, 'Tax invoice श्री')))
      const b = await renderToBuffer(doc)
      if (b.subarray(0, 5).toString() !== '%PDF-') throw new Error('not a PDF')
    `)
    execFileSync(process.execPath, ['render.mjs'], { cwd: box, stdio: 'pipe' })
  } catch (e) {
    console.error(`check:pdf-trace — ${route}: a PDF does not render from its traced files:\n${String(e.stderr ?? e.message).split('\n').slice(0, 6).join('\n')}`)
    failed = true
  } finally { rmSync(box, { recursive: true, force: true }) }
}
// Studio's Starter 0 (src/lib/studio/starter.ts) is read from the deployment by the Send action, on the Studio page's
// function (next.config.ts's outputFileTracingIncludes): every file of kit/starter must ship with it, or the first Send in
// production would fail (impact review of V3a R6).
{
  const page = '.next/server/app/(partner)/partner/studio/page.js'
  const nft = join(ROOT, page + '.nft.json')
  if (!existsSync(nft)) { console.error(`check:pdf-trace — ${page}.nft.json is missing (no Studio page built)`); failed = true }
  else {
    const base = dirname(join(ROOT, page))
    const shipped = new Set(JSON.parse(readFileSync(nft, 'utf8')).files.map((f) => relative(ROOT, resolve(base, f))))
    const kit = execFileSync('git', ['ls-files', 'kit/starter'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
    const lost = kit.filter((f) => !shipped.has(f))
    if (!kit.length || lost.length) { console.error(`check:pdf-trace — the Studio page does not ship Starter 0: ${lost.slice(0, 5).join(', ') || 'no kit files'}`); failed = true }
  }
}
if (failed) process.exit(1)
console.log(`check:pdf-trace — clean (${ROUTES.length} PDF routes render from their traced files; Studio ships Starter 0)`)
