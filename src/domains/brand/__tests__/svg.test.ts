import { describe, expect, it } from 'vitest'
import { cleanSvg, SVG_REFUSAL_WORDS } from '../svg'

// House of Ayuda's monogram as its design system draws it (mockup MONO), and the attacks the security review names.
const MONO = '<?xml version="1.0" encoding="UTF-8"?>\n<!-- Figma -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 52" width="40" height="52"><title>House of Ayuda</title><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 50V23.5C6 15 12.4 11 16.2 8.6"/><path d="M2 50h36"/></g><circle cx="20" cy="12.6" r="1.9" fill="#8C1D2C"/><text x="4" y="40" font-family="Mukta">Ayuda &amp; co</text></svg>'

const reason = (s: string) => { const r = cleanSvg(s); return r.ok ? 'ok' : r.reason }

describe('cleanSvg', () => {
  it('keeps a drawing, writes it again, drops comments, the title and the XML declaration', () => {
    const r = cleanSvg(MONO)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 52"')).toBe(true)
    expect(r.svg).toContain('<path d="M2 50h36"/>')
    expect(r.svg).toContain('<text x="4" y="40" font-family="Mukta">Ayuda &amp; co</text>')
    expect(r.svg).not.toMatch(/Figma|<title|<\?xml/)
    expect(cleanSvg(r.svg)).toEqual(r) // cleaning twice changes nothing
  })
  it('keeps only SVG’s and XLink’s namespaces', () => {
    const r = cleanSvg('<svg xmlns="http://www.w3.org/1999/xhtml" xmlns:xlink="http://evil.example/x"><rect width="1"/></svg>')
    expect(r.ok && r.svg).toBe('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1"/></svg>')
  })
  it('adds the namespace when it is missing', () => {
    const r = cleanSvg('<svg viewBox="0 0 1 1"><rect width="1" height="1"/></svg>')
    expect(r.ok && r.svg).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>')
  })
  it('keeps gradients and a use of its own symbol', () => {
    const r = cleanSvg('<svg><defs><linearGradient id="g"><stop offset="0" stop-color="#000"/></linearGradient><symbol id="m"><circle r="1"/></symbol></defs><rect fill="url(#g)" width="2" height="2"/><use href="#m" xlink:href="#m"/></svg>')
    expect(r.ok).toBe(true)
    expect(r.ok && r.svg).toContain('<linearGradient id="g">')
    expect(r.ok && r.svg).toContain('fill="url(#g)"')
  })
  it('drops <style>, unknown elements and attributes, and style attributes', () => {
    const r = cleanSvg('<svg><style>rect{fill:red}</style><sodipodi:namedview/><rect style="fill:red" data-x="1" inkscape:label="a" width="1"/><blink>x</blink></svg>')
    expect(r.ok && r.svg).toBe('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1"/></svg>')
  })
  it.each([
    ['<svg><script>alert(1)</script></svg>', 'script'],
    ['<svg><SCRIPT>alert(1)</SCRIPT></svg>', 'script'],
    ['<svg onload="alert(1)"/>', 'script'],
    ['<svg><rect onclick="x()"/></svg>', 'script'],
    ['<svg><a href="javascript:alert(1)"><rect/></a></svg>', 'script'],
    ['<svg><use href="java&#x09;script:alert(1)"/></svg>', 'script'],
    ['<svg><foreignObject><div/></foreignObject></svg>', 'script'],
    ['<svg><animate attributeName="href" to="javascript:x"/></svg>', 'script'],
    ['<svg><set attributeName="onmouseover" to="x"/></svg>', 'script'],
  ])('refuses a script: %s', (s, r) => { expect(reason(s)).toBe(r) })
  it.each([
    ['<svg><image href="https://evil.example/x.png"/></svg>'],
    ['<svg><use href="https://evil.example/s.svg#a"/></svg>'],
    ['<svg><use xlink:href="other.svg#a"/></svg>'],
    ['<svg><rect fill="url(https://evil.example/x)"/></svg>'],
    ['<svg><rect style="background:url(//evil.example)"/></svg>'],
    ['<svg><rect fill="url(data:image/png;base64,AAA)"/></svg>'],
    ['<?xml-stylesheet href="https://evil.example/x.css"?><svg/>'],
  ])('refuses a link outside the file: %s', (s) => { expect(reason(s)).toBe('external') })
  it('refuses a DOCTYPE and entities (XXE, billion laughs)', () => {
    expect(reason('<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "b">]><svg>&a;</svg>')).toBe('doctype')
    expect(reason('<svg><text>&a;</text></svg>')).toBe('markup')
  })
  it.each([['<svg><g></svg>'], ['<svg><rect width=1/></svg>'], ['<svg><![CDATA[x]]></svg>'], ['<svg/><svg/>'], ['<svg>&</svg>'], ['<svg>\u0001</svg>'], ['<svg/>trailing']])('refuses broken markup: %j', (s) => {
    expect(reason(s)).toBe('markup')
  })
  it('refuses a file that is not an SVG', () => { expect(reason('<html><svg/></html>')).toBe('not_svg'); expect(reason('hello')).toBe('not_svg') })
  it('refuses a file too big or too deep', () => {
    expect(reason('<svg>' + '<g>'.repeat(40) + '</g>'.repeat(40) + '</svg>')).toBe('too_big')
    expect(reason('<svg>' + '<rect/>'.repeat(4001) + '</svg>')).toBe('too_big')
    expect(reason('<svg>' + ' '.repeat(210 * 1024) + '</svg>')).toBe('too_big')
  })
  it('words each refusal for the field', () => { expect(SVG_REFUSAL_WORDS.script).toBe('This SVG has a script in it. Upload one without scripts.') })
})
