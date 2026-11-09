// Own domains D2·4–D2·6 on a real Postgres with the internet faked: Connect shows the records at once without
// touching Vercel; the check proves the row with its own token seen by both resolvers and queues the add; the add puts
// it on the project; then the host serves the shop. Skipped unless INT_DB_HOST is set.
import { afterAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/outbox/drain', () => ({ drainSoon: vi.fn() }))

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe.skipIf(!host)('own domains', () => {
  afterAll(() => vi.unstubAllGlobals())
  it('claims, proves, adds and serves; nothing reaches Vercel before the proof', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    process.env.VERCEL_API_TOKEN = 't'; process.env.VERCEL_PROJECT_ID = 'prj_1'; delete process.env.VERCEL
    const postgres = (await import('postgres')).default
    const su = postgres(`postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} })
    const A = '11111111-1111-1111-1111-111111111111', owner = '99999999-9999-9999-9999-999999999999'
    const dom = `own${Date.now() % 1_000_000}.in`
    let token = '', txtLive = false
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => {
      const m = init?.method ?? 'GET'; calls.push(`${m} ${u}`)
      if (u.includes('api.vercel.com')) {
        if (u.includes('/config')) return json(200, { misconfigured: false, recommendedIPv4: [{ rank: 1, value: ['76.76.21.21'] }], recommendedCNAME: [{ rank: 1, value: 'abc.vercel-dns-017.com.' }] })
        if (m === 'POST') return json(200, { name: dom })
        return json(200, { verified: true })
      }
      if (u.startsWith(`https://${dom}/`)) return new Response(null, { status: 200 })
      const q = new URL(u).searchParams, name = q.get('name'), type = q.get('type')
      if (type === 'TXT' && name === `_frrata.${dom}` && txtLive) return json(200, { Status: 0, Answer: [{ name: `${name}.`, type: 16, data: `"frrata-verify=${token}"` }] })
      if (type === 'A' && name === dom) return json(200, { Status: 0, Answer: [{ name: `${name}.`, type: 1, data: '76.76.21.21' }] })
      if (type === 'CNAME' && name === `www.${dom}`) return json(200, { Status: 0, Answer: [{ name: `${name}.`, type: 5, data: 'abc.vercel-dns-017.com.' }] })
      if (type === 'NS') return json(200, { Status: 0, Answer: [{ name: `${dom}.`, type: 2, data: 'ns51.domaincontrol.com.' }] })
      return json(200, { Status: 3 })
    }))
    const own = await import('@/lib/domains/own-domains')
    const platform = await import('@/lib/db/platform')
    const { sendDomainAdd } = await import('@/lib/domains/senders')
    try {
      const c = await own.claimDomain(A, owner, `https://www.${dom.toUpperCase()}/`)
      if (!c.ok) throw new Error(c.error)
      expect(c.claim.facts).toEqual({ host: dom, apex: dom, www: `www.${dom}` })
      expect(c.claim.records.map((r) => [r.type, r.name])).toEqual([['TXT', '_frrata'], ['A', '@'], ['CNAME', 'www']])
      expect(c.claim.records[2]!.value).toBe('abc.vercel-dns-017.com')
      expect(c.claim.dnsHost?.name).toBe('GoDaddy')
      expect(calls.some((x) => x.startsWith('POST https://api.vercel.com'))).toBe(false)
      token = c.claim.records[0]!.value.replace('frrata-verify=', '')

      // Not there yet: waiting; nothing queued.
      expect((await own.checkDomainRow(A, c.claim.id, { forDialog: false })).state).toBe('waiting')
      // Within 10 s: the lease says busy, nothing looked up.
      expect((await own.checkDomainRow(A, c.claim.id, { forDialog: false })).state).toBe('busy')
      await su`update shop_domains set checked_at = null where id = ${c.claim.id}`
      txtLive = true
      const r = await own.checkDomainRow(A, c.claim.id, { forDialog: false })
      expect(r.found.txt).toBe('yes')
      const [q] = await su`select kind, payload from outbox where dedupe_key = ${`domain.add:${c.claim.id}`}`
      expect(q?.kind).toBe('domain.add')
      expect(await platform.tenantForHost(dom)).toBeNull()

      await sendDomainAdd({ ...(q as object), tenantId: A } as never)
      expect(calls.filter((x) => x.startsWith('POST https://api.vercel.com/v10/projects/prj_1/domains')).length).toBe(2)
      expect((await platform.tenantForHost(dom))?.id).toBe(A)
      await su`update shop_domains set checked_at = null where id = ${c.claim.id}`
      expect((await own.checkDomainRow(A, c.claim.id, { forDialog: false })).state).toBe('connected')
      // Another shop's id is never checked under A.
      const [b] = await su`insert into shop_domains (tenant_id, host, apex, with_www, claimed_by) values ('22222222-2222-2222-2222-222222222222', ${'b' + dom}, ${'b' + dom}, false, 'aaaaaaaa-0000-0000-0000-000000000002') returning id`
      expect((await own.checkDomainRow(A, b!.id as string, { forDialog: false })).state).toBe('busy')
    } finally {
      await su`delete from outbox where dedupe_key like 'domain.add:%'`
      await su`delete from shop_domains where host like ${'%' + dom}`
      await su.end()
    }
  })
})
