import { describe, expect, it } from 'vitest'
import { dnsHostOf } from '../dns-hosts'

describe('dnsHostOf', () => {
  it('names listed hosts on a label boundary only', () => {
    expect(dnsHostOf(['ns71.domaincontrol.com.'])?.name).toBe('GoDaddy')
    expect(dnsHostOf(['ava.ns.cloudflare.com'])?.name).toBe('Cloudflare')
    expect(dnsHostOf(['ns-123.awsdns-45.net'])?.name).toBe('AWS Route 53')
    expect(dnsHostOf(['evildomaincontrol.com'])).toBeNull()
    expect(dnsHostOf(['ns1.example.in'])).toBeNull()
    expect(dnsHostOf([])).toBeNull()
  })
  it('never builds a link from the answer', () => {
    expect(dnsHostOf(['x.domaincontrol.com'])?.url).toBe('https://dcc.godaddy.com/control/portfolio')
  })
})
