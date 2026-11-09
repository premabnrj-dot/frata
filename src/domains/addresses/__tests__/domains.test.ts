import { describe, expect, it } from 'vitest'
import { checkDomain } from '../domains'
import { tidyDomain } from '../domain-input'

const opts = { consoleHost: 'frata.vercel.app', shopDomain: 'frrata.shop' }
const ok = (raw: string) => { const r = checkDomain(raw, opts); if (!r.ok) throw new Error(`${raw}: ${r.problem}`); return r.facts }
const problem = (raw: string) => { const r = checkDomain(raw, opts); return r.ok ? null : r.problem }

describe('tidyDomain (as typed, on the client)', () => {
  it('drops the scheme, path, query, fragment, case and trailing dot', () => {
    expect(tidyDomain('  https://www.KesarStudio.in/products?x=1#a ')).toBe('www.kesarstudio.in')
    expect(tidyDomain('kesarstudio.in.')).toBe('kesarstudio.in')
    expect(tidyDomain('HTTP://shop.kesar.in')).toBe('shop.kesar.in')
  })
})

describe('checkDomain', () => {
  it('connects the apex and sends www to it, whichever was typed', () => {
    expect(ok('https://www.KesarStudio.in/')).toEqual({ host: 'kesarstudio.in', apex: 'kesarstudio.in', www: 'www.kesarstudio.in' })
    expect(ok('kesarstudio.in')).toEqual({ host: 'kesarstudio.in', apex: 'kesarstudio.in', www: 'www.kesarstudio.in' })
  })
  it('knows the apex under a two-part suffix, and keeps a subdomain as typed', () => {
    expect(ok('www.kesar.co.in')).toEqual({ host: 'kesar.co.in', apex: 'kesar.co.in', www: 'www.kesar.co.in' })
    expect(ok('shop.rangthreads.in')).toEqual({ host: 'shop.rangthreads.in', apex: 'rangthreads.in', www: null })
  })
  it('refuses a bare public suffix', () => {
    expect(problem('co.in')).toBe('suffix')
  })
  it('refuses our hosts, hosting platforms, the console and local names, with their subdomains', () => {
    for (const h of ['frrata.shop', 'kesar.frrata.shop', 'frrata.com', 'x.vercel.app', 'frata.vercel.app', 'shop.local', 'a.test', 'x.onion', 'localhost.localdomain.internal']) expect(problem(h)).toBe('reserved')
  })
  it('refuses IPs, ports, look-alikes and shapes that are not host names', () => {
    expect(problem('192.168.1.1')).toBe('ip')
    expect(problem('[::1]')).toBe('ip')
    expect(problem('kesarstudio.in:8080')).toBe('shape')
    expect(problem('user@kesarstudio.in')).toBe('shape')
    expect(problem('kesar_studio.in')).toBe('shape')
    expect(problem('*.kesarstudio.in')).toBe('shape')
    expect(problem('kesar studio.in')).toBe('shape')
    expect(problem('-kesar.in')).toBe('shape')
    expect(problem(`${'a'.repeat(64)}.in`)).toBe('shape')
    expect(problem('kesarstudio')).toBe('shape')
    expect(problem('kesär.in')).toBe('not_ascii')
    expect(problem('xn--ksr-ula.in')).toBe('not_ascii')
    expect(problem('kesar.123')).toBe('tld')
    expect(problem('kesar.notarealtld')).toBe('tld')
    expect(problem('x'.repeat(301))).toBe('shape')
  })
})
