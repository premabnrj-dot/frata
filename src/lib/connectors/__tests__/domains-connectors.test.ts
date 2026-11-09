import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Shop addresses D2·4 + D2·5: the connectors, with fetch faked. Hosts are re-checked, replies capped, answers counted
// only for the name asked, and "couldn't tell" is never "no".
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
let calls: string[] = []
function fake(route: (url: string, init?: RequestInit) => Response) {
  vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => { calls.push(`${init?.method ?? 'GET'} ${u}`); return route(u, init) }))
}
beforeEach(() => { calls = []; vi.resetModules(); process.env.VERCEL_API_TOKEN = 't'; process.env.VERCEL_PROJECT_ID = 'prj_1'; process.env.VERCEL_TEAM_ID = 'team_1'; delete process.env.VERCEL; delete process.env.DOH_BASE; delete process.env.VERCEL_API_BASE })
afterEach(() => { vi.unstubAllGlobals() })

describe('vercel connector', () => {
  it('adds with www sent to the apex, on api.vercel.com with the team', async () => {
    fake(() => json(200, { name: 'x' }))
    const v = await import('../vercel')
    expect(await v.addDomain('www.kesarstudio.in', 'kesarstudio.in')).toEqual({ ok: true })
    expect(calls[0]).toBe('POST https://api.vercel.com/v10/projects/prj_1/domains?teamId=team_1')
  })
  it('refuses a host that is not a host name before any call', async () => {
    fake(() => json(200, {}))
    const v = await import('../vercel')
    await expect(v.projectDomain('../v9/projects/prj_1/env')).rejects.toThrow('bad host')
    await expect(v.addDomain('a b.in')).rejects.toThrow('bad host')
    expect(calls).toEqual([])
  })
  it('a 409 is success only when the domain is on our project; otherwise Vercel\'s own TXT', async () => {
    fake((_u, init) => init?.method === 'POST' ? json(409, { error: { code: 'x', verification: [{ type: 'TXT', value: 'vc-domain-verify=abc' }] } }) : json(404, {}))
    let v = await import('../vercel')
    expect(await v.addDomain('kesarstudio.in')).toEqual({ ok: false, why: 'other_account', vercelTxt: 'vc-domain-verify=abc' })
    vi.resetModules()
    fake((_u, init) => init?.method === 'POST' ? json(409, { error: { code: 'x' } }) : json(200, { verified: true }))
    v = await import('../vercel')
    expect(await v.addDomain('kesarstudio.in')).toEqual({ ok: true })
  })
  it('a full project is our failure ("limit"), not the merchant\'s', async () => {
    fake(() => json(402, { error: { code: 'domain_limit_reached' } }))
    const v = await import('../vercel')
    expect(await v.addDomain('kesarstudio.in')).toEqual({ ok: false, why: 'limit' })
  })
  it('a reply over 64 kB is dropped; a timeout or error is "couldn\'t tell"', async () => {
    fake(() => new Response('x'.repeat(70 * 1024), { status: 200 }))
    const v = await import('../vercel')
    expect(await v.projectDomain('kesarstudio.in')).toBeNull()
    expect(await v.domainMisconfigured('kesarstudio.in')).toBeNull()
  })
  it('a fake base is honoured only off Vercel and only on 127.0.0.1', async () => {
    process.env.VERCEL_API_BASE = 'http://127.0.0.1:4567'
    fake(() => json(200, {}))
    let v = await import('../vercel')
    await v.removeDomain('kesarstudio.in')
    expect(calls[0]).toMatch(/^DELETE http:\/\/127\.0\.0\.1:4567\//)
    vi.resetModules(); calls = []; process.env.VERCEL = '1'
    v = await import('../vercel')
    await v.removeDomain('kesarstudio.in')
    expect(calls[0]).toMatch(/^DELETE https:\/\/api\.vercel\.com\//)
    vi.resetModules(); calls = []; delete process.env.VERCEL; process.env.VERCEL_API_BASE = 'https://evil.example'
    v = await import('../vercel')
    await v.removeDomain('kesarstudio.in')
    expect(calls[0]).toMatch(/^DELETE https:\/\/api\.vercel\.com\//)
  })
  it('reads the project\'s own A and CNAME once, with checked shapes', async () => {
    fake(() => json(200, { recommendedIPv4: [{ rank: 1, value: ['216.198.79.1'] }], recommendedCNAME: [{ rank: 1, value: 'd41f8c2a.vercel-dns-017.com.' }] }))
    const v = await import('../vercel')
    expect(await v.projectRecords('www.frrata.shop')).toEqual({ a: '216.198.79.1', cname: 'd41f8c2a.vercel-dns-017.com' })
    await v.projectRecords('www.frrata.shop')
    expect(calls.length).toBe(1)
  })
})

describe('dns connector', () => {
  const answer = (name: string, type: number, data: string[]) => ({ Status: 0, Answer: data.map((d) => ({ name: `${name}.`, type, data: d })) })
  it('a proof needs both resolvers; one alone is unknown, neither is no', async () => {
    fake((u) => u.includes('cloudflare') ? json(200, answer('_frrata.kesarstudio.in', 16, ['"frrata-verify=abc"'])) : json(200, answer('_frrata.kesarstudio.in', 16, ['"frrata-verify=abc"'])))
    let d = await import('../dns')
    expect(await d.txtSeen('_frrata.kesarstudio.in', 'frrata-verify=abc')).toBe('yes')
    vi.resetModules()
    fake((u) => u.includes('cloudflare') ? json(200, answer('_frrata.kesarstudio.in', 16, ['"frrata-verify=abc"'])) : json(200, { Status: 3 }))
    d = await import('../dns')
    expect(await d.txtSeen('_frrata.kesarstudio.in', 'frrata-verify=abc')).toBe('unknown')
    vi.resetModules()
    fake(() => json(200, { Status: 3 }))
    d = await import('../dns')
    expect(await d.txtSeen('_frrata.kesarstudio.in', 'frrata-verify=abc')).toBe('no')
    vi.resetModules()
    fake(() => json(500, {}))
    d = await import('../dns')
    expect(await d.txtSeen('_frrata.kesarstudio.in', 'frrata-verify=abc')).toBe('unknown')
  })
  it('an answer for another name never counts; split TXT chunks join', async () => {
    fake(() => json(200, answer('_frrata.other.in', 16, ['"frrata-verify=abc"'])))
    let d = await import('../dns')
    expect(await d.txtSeen('_frrata.kesarstudio.in', 'frrata-verify=abc')).toBe('no')
    vi.resetModules()
    fake(() => json(200, answer('_frrata.kesarstudio.in', 16, ['"frrata-verify=" "abc"'])))
    d = await import('../dns')
    expect(await d.txtSeen('_frrata.kesarstudio.in', 'frrata-verify=abc')).toBe('yes')
  })
  it('an apex points at us only when every A record is ours; the stray one is shown', async () => {
    fake(() => json(200, answer('kesarstudio.in', 1, ['76.76.21.21', '3.110.44.9'])))
    const d = await import('../dns')
    expect(await d.pointsAt('kesarstudio.in', { a: '76.76.21.21', cname: 'cname.vercel-dns.com' }, true)).toEqual({ seen: 'no', found: '3.110.44.9' })
  })
  it('a CAA without letsencrypt blocks the certificate', async () => {
    fake(() => json(200, answer('kesarstudio.in', 257, ['0 issue "digicert.com"'])))
    const d = await import('../dns')
    expect(await d.caaBlocks('kesarstudio.in')).toBe('yes')
  })
})
