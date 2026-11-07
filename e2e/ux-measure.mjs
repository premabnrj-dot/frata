// =============================================================================
// FILE: e2e/ux-measure.mjs — the UX net's in-page measurements (flow 90-ux).
// Runs inside the browser through page.evaluate(MEASURE, opts). Each check
// returns what failed, in words, so the flow can key it as check · page · width.
// From the stress test of 2026-11-07; the checks follow frata-design-language
// § UX foundation and WCAG 2.2 AA (1.4.3, 1.4.10, 1.4.11, 2.4.1, 2.4.2, 2.5.8).
// =============================================================================
export const MEASURE = ({ phone }) => {
  const vw = document.documentElement.clientWidth
  const cv = document.createElement('canvas'); cv.width = cv.height = 1
  const cx = cv.getContext('2d', { willReadFrequently: true })
  const rgba = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255] }
  const parse = (c) => { if (!c || c === 'transparent') return [0, 0, 0, 0]; const m = c.match(/^rgba?\(([^)]+)\)$/); if (m) { const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1] } return rgba(c) }
  const blend = (top, bot) => { const a = top[3] + bot[3] * (1 - top[3]); if (!a) return [255, 255, 255, 1]; return [0, 1, 2].map((k) => (top[k] * top[3] + bot[k] * bot[3] * (1 - top[3])) / a).concat(a) }
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  const bgOf = (el) => { const stack = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c[3] > 0) { stack.push(c); if (c[3] >= 1) break } } let bg = [255, 255, 255, 1]; for (let i = stack.length - 1; i >= 0; i--) bg = blend(stack[i], bg); return bg }
  const visible = (el) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.visibility === 'hidden' || s.display === 'none') return false } return true }
  const srOnly = (el) => { for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.position === 'absolute' && (s.clip === 'rect(0px, 0px, 0px, 0px)' || s.clipPath === 'inset(50%)') && parseFloat(s.width) <= 1) return true } return false }
  const disabled = (el) => !!el.closest('[disabled],[aria-disabled="true"]')
  const desc = (el) => { const t = (el.getAttribute('aria-label') || el.innerText || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 40); return `${el.tagName.toLowerCase()} "${t}"` }
  const inScroller = (el) => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(e).overflowX)) return true; return false }

  // 1.4.10 reflow: the page itself never scrolls sideways.
  const doc = document.documentElement
  const mainEl = document.querySelector('main')
  const overflow = doc.scrollWidth > vw + 1
    ? (() => { const who = [...document.body.querySelectorAll('*')].filter((el) => el.getBoundingClientRect().right > vw + 1 && !inScroller(el)).slice(0, 3).map(desc); return who.length ? who : [`document ${doc.scrollWidth}/${vw}`] })()
    // A main that scrolls on its own hides sideways scroll from the document: check it too.
    : mainEl && mainEl.scrollWidth > mainEl.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(mainEl).overflowX) ? [`main ${mainEl.scrollWidth}/${mainEl.clientWidth}`] : []

  // Tables on phones become rows (rule 15): no table may scroll sideways inside its frame under 768 px.
  const tableScroll = phone ? [...document.querySelectorAll('table')].filter((t) => visible(t) && t.parentElement && t.parentElement.scrollWidth > t.parentElement.clientWidth + 1).map((t) => `table ${t.parentElement.clientWidth}/${t.parentElement.scrollWidth}`) : []

  // 2.5.8 target size: every visible control ≥ 24 × 24 (inline links in running text are exempt; disabled ones too).
  const INTER = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab],[tabindex]:not([tabindex="-1"])'
  const targets = []
  for (const el of document.querySelectorAll(INTER)) {
    if (!visible(el) || srOnly(el) || disabled(el)) continue
    const r = el.getBoundingClientRect()
    const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline' && /^(P|LI|SPAN|TD|DD|LABEL)$/.test(el.parentElement?.tagName)
    if (!inline && (r.width < 23 || r.height < 23)) targets.push(`${desc(el)} ${Math.round(r.width)}×${Math.round(r.height)}`)
  }

  // 1.4.3 contrast: text ≥ 4.5:1, large text ≥ 3:1, opacity counted; disabled controls exempt.
  const contrast = []
  const seen = new Set()
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n; (n = walker.nextNode());) {
    if (!n.textContent.trim()) continue
    const el = n.parentElement; if (!el || seen.has(el)) continue; seen.add(el)
    if (!visible(el) || srOnly(el) || disabled(el) || el.closest('svg,script,style,noscript,img')) continue
    const s = getComputedStyle(el)
    const bg = bgOf(el)
    let op = 1; for (let e = el; e; e = e.parentElement) op *= +getComputedStyle(e).opacity
    const fgRaw = parse(s.color)
    const fg = blend([fgRaw[0], fgRaw[1], fgRaw[2], fgRaw[3] * op], bg)
    const size = parseFloat(s.fontSize), bold = +s.fontWeight >= 700
    const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5
    const r = ratio(fg, bg)
    if (r < need - 0.01) contrast.push(`"${n.textContent.trim().slice(0, 30)}" ${r.toFixed(2)}:1`)
  }

  // Shadows are not edges (forced colours drop them): any visible element with a shadow must also have a border.
  const shadowEdge = [...document.body.querySelectorAll('*')].filter((el) => { const s = getComputedStyle(el); return s.boxShadow !== 'none' && visible(el) && parseFloat(s.borderTopWidth) === 0 && parseFloat(s.borderLeftWidth) === 0 && !el.matches(INTER) }).slice(0, 3).map(desc)

  // Nav: exactly one current item in the visible nav (rule 9). Hidden navs (the other width's) do not count.
  const current = [...document.querySelectorAll('nav [aria-current="page"]')].filter((a) => visible(a) && !a.closest('[aria-label="Sections"],[aria-label="Pages"],[aria-label="Filter by status"]'))

  // 2.4.1 bypass: the first focusable is a skip link to the content.
  const first = [...document.querySelectorAll(INTER)].find((el) => !disabled(el) && (visible(el) || el.matches('a[href^="#"]')))
  const skip = !!first && first.tagName === 'A' && /^#/.test(first.getAttribute('href') ?? '') && /skip/i.test(first.textContent)

  return {
    title: document.title, overflow, tableScroll, targets, contrast, shadowEdge, current: current.length, skip,
    domNodes: document.querySelectorAll('*').length,
    fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0),
  }
}

/** After a Tab press: does the focused element show a focus ring of ≥ 2 px, and is it inside the viewport, not under a sticky bar? */
export const FOCUS = () => {
  const el = document.activeElement
  if (!el || el === document.body) return { ok: true, what: 'body' }
  const cv = document.createElement('canvas'); cv.width = cv.height = 1
  const cx = cv.getContext('2d', { willReadFrequently: true })
  const rgb = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255] }
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  // The ring is drawn outside the element (offset 2 px): measure it against the first opaque background around it.
  let bg = [255, 255, 255, 1]
  for (let e = el.parentElement; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c[3] >= 1) { bg = c; break } }
  const s = getComputedStyle(el)
  const width = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2
  const contrast = width ? ratio(rgb(s.outlineColor), bg) : 0
  const ring = width && contrast >= 3
  const r = el.getBoundingClientRect()
  const at = document.elementFromPoint(Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1), Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1))
  const covered = r.height > 0 && at && !el.contains(at) && !at.contains(el) && at.closest('[class*="sticky"],[class*="fixed"]')
  return { ok: ring && !covered, what: `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}"${width ? ` ring ${contrast.toFixed(2)}:1` : ''}`, ring, covered: !!covered }
}

/** WCAG 1.4.12 text spacing, applied to the whole page. */
export const TEXT_SPACING = '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important } p { margin-bottom: 2em !important }'
