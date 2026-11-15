// The move out of the look (drizzle/0132 app_move_content; plan docs/plans/2026-11-15-v1-content.md § The move) on a
// real Postgres: the SQL picks each store's live look exactly as liveOf does (src/domains/themes/release.ts, through
// liveRevision), copies only its bar, menus and Contact line, verbatim; a never-published store is copied from its
// draft; a re-run refreshes what nobody saved and leaves a person's save alone; one notice, once. Skipped unless
// INT_DB_HOST is set. It makes its own stores (fresh ids) and leaves them.
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { describe, expect, it } from 'vitest'

const host = process.env.INT_DB_HOST
const dbName = process.env.INT_DB_NAME ?? 'frata_proof'
const pass = process.env.INT_DB_PASSWORD ?? 'x'
const WHO = '99999999-9999-9999-9999-999999999999'
const menu = (label: string) => [{ id: label.toLowerCase(), label, link: '/products', icon: null, children: [] }]

describe.skipIf(!host)('the move out of the look', () => {
  it('copies each store’s live look, as liveOf picks it, and reconciles on a re-run', async () => {
    process.env.DATABASE_URL = `postgresql://frata_app:${pass}@${host}/${dbName}`
    const su = postgres(process.env.INT_DB_SUPER_URL ?? `postgresql://postgres@${host}/${dbName}`, { max: 1, onnotice: () => {} })
    const { withTenant } = await import('@/lib/db/tenant')
    const { liveRevision } = await import('@/lib/themes/look')
    try {
      const A = randomUUID(), B = randomUUID(), C = randomUUID()
      for (const t of [A, B, C]) await su`insert into tenants (id, slug, name) values (${t}, ${'move-' + t.slice(0, 8)}, 'Move')`
      // Versions: Bazaar 9.9.1 withdrawn, Bazaar 9.9.2 recalled (recalled stays live), Bazaar 9.9.3 plain.
      await su`insert into theme_versions (theme_key, version, released_at, withdrawn_at) values ('bazaar', '9.9.1', now(), now()) on conflict do nothing`
      await su`insert into theme_versions (theme_key, version, released_at, recalled_at) values ('bazaar', '9.9.2', now(), now()) on conflict do nothing`
      const rev = async (t: string, version: string, settings: object, at: string, publish = true) => {
        const [r] = await su`insert into shop_theme_revisions (tenant_id, theme_key, theme_version, style_key, settings, created_by, updated_by, created_at)
          values (${t}, 'bazaar', ${version}, 'sindoor', ${su.json(settings as never)}, ${WHO}, ${WHO}, ${at}) returning id`
        if (publish) await su`insert into shop_theme_publishes (tenant_id, revision_id, published_by, published_at) values (${t}, ${r!.id}, ${WHO}, ${at})`
        return r!.id as string
      }
      // A: the newest publish is on the withdrawn version → the recalled one before it is live; an older publish of 9.9.3.
      await rev(A, '9.9.3', { menus: { main: menu('Old') } }, '2026-01-01T00:00:00Z')
      const liveA = await rev(A, '9.9.2', { settings: { announcement: { text: 'A-bar', link: null, scheme: 'ink' } }, menus: { main: menu('Live'), footer: [], tabs: null }, contact: { line: '  ' } }, '2026-02-01T00:00:00Z')
      await rev(A, '9.9.1', { menus: { main: menu('Withdrawn') } }, '2026-03-01T00:00:00Z')
      await rev(A, '9.9.3', { menus: { main: menu('Draft') } }, '2026-04-01T00:00:00Z', false)
      // B: never published: copied from its draft. C: a 40 kB main menu (skipped, named in the notice).
      await rev(B, '9.9.3', { contact: { line: 'B-line' } }, '2026-01-01T00:00:00Z', false)
      const big = Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, label: 'x'.repeat(200), link: '/products', icon: null, children: Array.from({ length: 12 }, (_, j) => ({ id: `m${i}-${j}`, label: 'y'.repeat(200), link: '/products', icon: null, children: [] })) }))
      await rev(C, '9.9.3', { menus: { main: big } }, '2026-01-01T00:00:00Z')

      await su`select app_move_content()`
      const rows = async (t: string) => su`select kind, key, value, updated_by from site_content where tenant_id = ${t} order by kind, key`

      // A: liveOf's revision, its parts verbatim; `tabs: null` → no row; `footer: []` → an empty menu; a blank line → none.
      expect((await withTenant(A, (tx) => liveRevision(tx, A)))?.id).toBe(liveA)
      expect((await rows(A)).map((r) => [r.kind, r.key, r.value])).toEqual([
        ['announcement', 'moved', { text: 'A-bar', link: null, scheme: 'ink' }],
        ['menu', 'footer', []],
        ['menu', 'main', menu('Live')],
      ])
      // B: from the draft. C: the menu too big to move is skipped and named.
      expect((await rows(B)).map((r) => r.value)).toEqual([{ line: 'B-line' }])
      expect(await rows(C)).toEqual([])
      const notes = async (t: string) => su`select title, body from notices where tenant_id = ${t} and source_kind = 'content'`
      expect((await notes(A))[0]?.body).toMatch(/^Unpublished menu, bar and Contact line changes were not moved\./)
      expect((await notes(C))[0]?.body).toMatch(/Too long to move: Main menu\./)
      expect(JSON.stringify(await notes(B))).not.toMatch(/A-bar|Live/)

      // A publish between two runs is reconciled; a person's save is never touched; the notice is not sent again.
      await rev(A, '9.9.3', { settings: { announcement: null }, menus: { main: menu('Newer') } }, '2026-05-01T00:00:00Z')
      await su`update site_content set value = ${su.json([] as never)}, updated_by = ${WHO} where tenant_id = ${A} and kind = 'menu' and key = 'footer'`
      await su`select app_move_content()`
      expect((await rows(A)).map((r) => [r.kind, r.key, r.value])).toEqual([
        ['menu', 'footer', []],
        ['menu', 'main', menu('Newer')],
      ])
      expect((await notes(A)).length).toBe(1)
      expect((await su`select current_setting('app.tenant_id', true) as t`)[0]?.t ?? '').toBe('')
    } finally { await su.end() }
  })
})
