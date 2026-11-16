// =============================================================================
// FILE: src/domains/brand/svg.ts — THE SVG LOGO CLEANER (one-address plan P1·4; security review: SVG only through an
// allowlist, shown only through <img>). An SVG is a document that can carry script, so it is never stored as uploaded:
// it is read by a strict tokenizer and WRITTEN AGAIN from an allowlist of drawing elements and attributes. Refused
// outright (the person is told why, at the field): a script in any form (<script>, an on* attribute, a javascript: or
// data: link), a link outside the file (href, url(…) or xlink not to `#id`), <foreignObject>, a DOCTYPE or entity
// (XXE, billion laughs), a processing instruction other than the XML declaration, broken markup, more than 4000
// elements or a nesting deeper than 32. Dropped quietly: <style>, metadata, comments, unknown elements and attributes,
// `style` attributes (CSS can reach the network). Pure: string in, string or a reason out.
// =============================================================================

export type SvgRefusal = 'script' | 'external' | 'doctype' | 'markup' | 'too_big' | 'not_svg'
export type SvgResult = { ok: true; svg: string } | { ok: false; reason: SvgRefusal }

export const SVG_REFUSAL_WORDS: Record<SvgRefusal, string> = {
  script: 'This SVG has a script in it. Upload one without scripts.',
  external: 'This SVG links to files outside it. Upload one without links.',
  doctype: 'This SVG has code we can’t read. Export it again as plain SVG.',
  markup: 'This SVG could not be read. Export it again as plain SVG.',
  too_big: 'This SVG is too detailed. Simplify it and upload it again.',
  not_svg: 'Upload an SVG, PNG or WebP file.',
}

const ELEMENTS = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'defs', 'lineargradient',
  'radialgradient', 'stop', 'clippath', 'mask', 'symbol', 'use', 'title', 'desc'])
/** Children of these are dropped with them (their content is never drawing). */
const DROP_WHOLE = new Set(['style', 'metadata', 'sodipodi:namedview', 'title', 'desc'])
const REFUSE = new Set(['script', 'foreignobject', 'iframe', 'object', 'embed', 'image', 'feimage', 'animate', 'set', 'animatemotion', 'animatetransform', 'handler', 'listener', 'a'])
const ATTRS = new Set(['id', 'class', 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'viewbox', 'points', 'fill', 'fill-opacity',
  'fill-rule', 'clip-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset',
  'stroke-opacity', 'opacity', 'transform', 'offset', 'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform', 'spreadmethod', 'fx', 'fy',
  'clip-path', 'mask', 'maskunits', 'clippathunits', 'preserveaspectratio', 'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing',
  'text-anchor', 'dominant-baseline', 'dx', 'dy', 'xmlns', 'version', 'role', 'aria-label', 'aria-hidden', 'href', 'xlink:href', 'xmlns:xlink', 'vector-effect'])
const MAX_ELEMENTS = 4000, MAX_DEPTH = 32
const SVG_NS = 'http://www.w3.org/2000/svg', XLINK_NS = 'http://www.w3.org/1999/xlink'

const NAME = /^[A-Za-z_][A-Za-z0-9_.:-]*$/
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/** Character references to text; anything else is broken markup (an entity of its own is refused before this). */
function decode(s: string): string | null {
  if (/&(?!(#x[0-9a-f]+|#[0-9]+|[a-z]+);)/i.test(s)) return null
  let bad = false
  const out = s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (_m, e: string) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); if (!(n > 0 && n <= 0x10ffff)) { bad = true; return '' } return String.fromCodePoint(n) }
    const v = ENT[e.toLowerCase()]
    if (v === undefined) bad = true
    return v ?? ''
  })
  return bad ? null : out
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** Control characters other than tab and line breaks never belong in a drawing. */
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/

type Attr = [string, string]
type Node = { tag: string; attrs: Attr[]; kids: (Node | string)[] }

/** Clean an SVG file's text. */
export function cleanSvg(input: string): SvgResult {
  if (input.length > 200 * 1024) return { ok: false, reason: 'too_big' }
  const src = input.replace(/^﻿/, '')
  if (CONTROL.test(src)) return { ok: false, reason: 'markup' }
  if (/<!DOCTYPE|<!ENTITY/i.test(src)) return { ok: false, reason: 'doctype' }
  const root: Node = { tag: '#root', attrs: [], kids: [] }
  const stack: Node[] = [root]
  let i = 0, count = 0, refusal: SvgRefusal | null = null
  const refuse = (r: SvgRefusal) => { if (!refusal || r === 'script') refusal = r } // a script is named first
  while (i < src.length && !refusal) {
    const lt = src.indexOf('<', i)
    const text = src.slice(i, lt < 0 ? src.length : lt)
    if (text) { const t = decode(text); if (t === null) return { ok: false, reason: 'markup' }; stack[stack.length - 1]!.kids.push(t) }
    if (lt < 0) break
    if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt + 4); if (e < 0) return { ok: false, reason: 'markup' }; i = e + 3; continue }
    if (src.startsWith('<![CDATA[', lt)) return { ok: false, reason: 'markup' }
    if (src.startsWith('<?', lt)) {
      const e = src.indexOf('?>', lt + 2); if (e < 0) return { ok: false, reason: 'markup' }
      if (!/^<\?xml[\s?]/i.test(src.slice(lt, e + 2)) || count > 0) return { ok: false, reason: /^<\?xml-stylesheet/i.test(src.slice(lt)) ? 'external' : 'markup' }
      i = e + 2; continue
    }
    if (src.startsWith('</', lt)) {
      const e = src.indexOf('>', lt); if (e < 0) return { ok: false, reason: 'markup' }
      const name = src.slice(lt + 2, e).trim().toLowerCase()
      const top = stack.pop()
      if (!top || top.tag !== name || stack.length === 0) return { ok: false, reason: 'markup' }
      i = e + 1; continue
    }
    // A start tag: its name, then attributes in quotes, then > or />.
    let j = lt + 1
    const nm = /^[A-Za-z_][A-Za-z0-9_.:-]*/.exec(src.slice(j))
    if (!nm) return { ok: false, reason: 'markup' }
    const tag = nm[0].toLowerCase(); j += nm[0].length
    const attrs: Attr[] = []
    let selfClose = false
    for (;;) {
      const ws = /^\s*/.exec(src.slice(j))![0]; j += ws.length
      if (src[j] === '>') { j++; break }
      if (src.startsWith('/>', j)) { selfClose = true; j += 2; break }
      if (!ws && attrs.length) return { ok: false, reason: 'markup' }
      const an = /^[A-Za-z_][A-Za-z0-9_.:-]*/.exec(src.slice(j))
      if (!an) return { ok: false, reason: 'markup' }
      j += an[0].length
      const eq = /^\s*=\s*/.exec(src.slice(j)); if (!eq) return { ok: false, reason: 'markup' }
      j += eq[0].length
      const q = src[j]; if (q !== '"' && q !== "'") return { ok: false, reason: 'markup' }
      const end = src.indexOf(q, j + 1); if (end < 0) return { ok: false, reason: 'markup' }
      const raw = src.slice(j + 1, end); if (raw.includes('<')) return { ok: false, reason: 'markup' }
      const v = decode(raw); if (v === null) return { ok: false, reason: 'markup' }
      attrs.push([an[0].toLowerCase(), v]); j = end + 1
    }
    if (REFUSE.has(tag)) refuse(tag === 'script' || tag === 'handler' || tag === 'listener' || tag.startsWith('animate') || tag === 'set' ? 'script' : tag === 'foreignobject' ? 'script' : 'external')
    for (const [a, v] of attrs) {
      const flat = v.replace(/[\s\u0000-\u001f]/g, '').toLowerCase()
      if (a.startsWith('on') || flat.includes('javascript:') || flat.includes('vbscript:')) refuse('script')
      if (flat.includes('data:')) refuse('external')
      if ((a === 'href' || a.endsWith(':href') || a === 'src') && !/^#[A-Za-z_][A-Za-z0-9_.:-]*$/.test(v.trim())) refuse('external')
      if (/url\(/i.test(v) && !/^\s*url\(\s*['"]?#[A-Za-z_][A-Za-z0-9_.:-]*['"]?\s*\)\s*$/i.test(v)) refuse('external')
      if (a === 'style' && /url\(|@import|expression\(/i.test(v)) refuse('external')
    }
    if (++count > MAX_ELEMENTS || stack.length > MAX_DEPTH) return { ok: false, reason: 'too_big' }
    if (count === 1 && tag !== 'svg') return { ok: false, reason: 'not_svg' }
    const node: Node = { tag, attrs, kids: [] }
    stack[stack.length - 1]!.kids.push(node)
    if (!selfClose) stack.push(node)
    i = j
  }
  if (refusal) return { ok: false, reason: refusal }
  if (stack.length !== 1) return { ok: false, reason: 'markup' }
  const svg = root.kids.filter((k): k is Node => typeof k !== 'string')
  if (svg.length !== 1 || svg[0]!.tag !== 'svg' || root.kids.some((k) => typeof k === 'string' && k.trim())) return { ok: false, reason: svg.length ? 'markup' : 'not_svg' }
  return { ok: true, svg: write(svg[0]!, true) }
}

function write(n: Node, top = false): string {
  if (DROP_WHOLE.has(n.tag) || !ELEMENTS.has(n.tag)) return ''
  // The namespaces are SVG's and XLink's, never another (security review LOW-1: an XHTML root kept as written).
  const attrs = n.attrs.filter(([a, v]) => ATTRS.has(a) && NAME.test(a) && (a !== 'xmlns' || v === SVG_NS) && (a !== 'xmlns:xlink' || v === XLINK_NS))
  if (top && !attrs.some(([a]) => a === 'xmlns')) attrs.unshift(['xmlns', SVG_NS])
  const head = `<${tagCase(n.tag)}${attrs.map(([a, v]) => ` ${attrCase(a)}="${esc(v)}"`).join('')}`
  const body = n.kids.map((k) => (typeof k === 'string' ? (n.tag === 'text' || n.tag === 'tspan' ? esc(k) : k.trim() ? '' : '') : write(k))).join('')
  return body ? `${head}>${body}</${tagCase(n.tag)}>` : `${head}/>`
}
const CASE: Record<string, string> = { lineargradient: 'linearGradient', radialgradient: 'radialGradient', clippath: 'clipPath', viewbox: 'viewBox', gradientunits: 'gradientUnits',
  gradienttransform: 'gradientTransform', spreadmethod: 'spreadMethod', maskunits: 'maskUnits', clippathunits: 'clipPathUnits', preserveaspectratio: 'preserveAspectRatio' }
const tagCase = (t: string) => CASE[t] ?? t
const attrCase = (a: string) => CASE[a] ?? a
