import { describe, expect, it } from 'vitest'

// The gate on fixtures: each rule fires on a line that breaks it, and code shapes stay quiet.
describe('check:words', async () => {
  const { check, judge, sentences, inScope } = await import('../check-words.mjs')
  const F = 'src/app/(console)/console/x/page.tsx'
  const rules = (src: string, file = F) => check(src, file).fails.map((f: { rule: string }) => f.rule)

  it('W1: 16 words or more fails, 13–15 warns', () => {
    const sixteen = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen'
    expect(rules(`const a = '${sixteen}.'`)).toEqual(['W1'])
    const r = check(`const a = 'one two three four five six seven eight nine ten eleven twelve thirteen.'`, F)
    expect(r.fails).toEqual([]); expect(r.warns).toHaveLength(1)
    expect(rules(`const a = 'Short one. Another short one.'`)).toEqual([])
  })
  it('W1 reads a template and JSX across their expressions as one sentence', () => {
    expect(rules('const a = `one two three four ${x} six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen`')).toEqual(['W1'])
    expect(rules('const a = <p>one two three four {x} six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen</p>')).toEqual(['W1'])
  })
  it('W2: semicolon, colon and dash joining two thoughts; a value after a colon passes', () => {
    expect(rules(`const a = 'Check your connection; nothing was changed.'`)).toEqual(['W2'])
    expect(rules(`const a = 'Archived: not shown to shoppers anywhere'`)).toEqual(['W2'])
    expect(rules(`const a = 'Paid online — collect nothing at all.'`)).toEqual(['W2'])
    expect(rules('const a = `Delivery address: ${x}`')).toEqual([])
    expect(rules(`const a = 'Pay on delivery: ₹49 a order'`)).toEqual([])
    expect(rules(`const a = 'Open 10 am – 6 pm daily'`)).toEqual([])
  })
  it('W3, W4: the swap list and words that are not a store owner’s', () => {
    expect(rules(`const a = 'Saved successfully.'`)).toEqual(['W3'])
    expect(rules(`const a = 'Pick a variant first.'`)).toEqual(['W4'])
    expect(rules(`const a = 'Returns by pincode'`)).toEqual(['W4'])
    expect(rules(`const a = 'Returns by PIN code'`)).toEqual([])
    expect(rules(`const a = 'Returns by Pin code'`)).toEqual(['W4'])
  })
  it('W5: store, never shop; the verbs pass', () => {
    expect(rules(`const a = 'Close the shop for now'`)).toEqual(['W5'])
    expect(rules(`const a = <p>Your shop’s name</p>`)).toEqual(['W5'])
    expect(rules(`const a = 'Shop all'`)).toEqual([])
    expect(rules(`const a = 'A shopper wrote'`)).toEqual([])
  })
  it('W6: admin is not a person; Frrata Admin is the staff surface', () => {
    expect(rules(`const a = 'Ask the owner or an admin.'`)).toEqual(['W6'])
    expect(rules(`const a = { owner: 'Owner', admin: 'Admin' }`)).toEqual(['W6'])
    expect(rules(`const a = 'Back to Frrata Admin'`)).toEqual([])
  })
  it('W7: Shipped and Confirmed as a state value, only in the state files; the verb passes', () => {
    const L = 'src/app/(console)/console/orders/_components/labels.ts'
    expect(rules(`const s = { shipped: { label: 'Shipped', tone: 'info' } }`, L)).toEqual(['W7'])
    expect(rules(`const s = { shipped: { label: 'Shipped', tone: 'info' } }`)).toEqual([])
    expect(rules(`const b = 'Mark shipped'`, L)).toEqual([])
  })
  it('W8, W9: buttons, exclamation marks, emoji', () => {
    expect(rules(`const a = <button>OK</button>`)).toEqual(['W8'])
    expect(rules(`const a = 'Your store is open!'`)).toEqual(['W9'])
    expect(rules(`const a = 'Your store is open 🎉'`)).toEqual(['W9'])
  })
  it('filler runs on every surface, the other rules only in scope', () => {
    const S = 'src/components/storefront/x.tsx'
    expect(rules(`const a = 'Simply add it to your shop; it is easy.'`, S)).toEqual(['filler'])
    expect(inScope(S)).toBe(false)
    expect(inScope('src/app/(admin)/admin/x/page.tsx')).toBe(true) // Frrata Admin joined in Neel N4, with its own rule set
    expect(inScope('src/app/(console)/console/analytics/page.tsx')).toBe(true)
    expect(inScope(F)).toBe(true)
  })
  it('never reads code: directives, imports, classes, SQL, errors, logs, keys, MIME, CSP, cookies, paths, SVG', () => {
    const src = [
      "'use server'",
      "import { x } from '@/components/shop-preview/fonts'",
      "const a = <div className=\"flex items-center gap-2 text-sm md:hidden\" data-x=\"one shop two\" />",
      "const b = cn('rounded-md border bg-card px-3 py-2 text-sm', on && 'ring-2')",
      'const c = sql`select count(*) from orders where tenant_id = ${t}; select 1`',
      "throw new Error('the shop row is missing; check the tenant')",
      "console.error('shop sync failed: webhook token invalid')",
      "refreshShop(r.tenantId, 'shop')",
      "const d = { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Security-Policy': \"default-src 'none'; style-src 'self'\" }",
      "document.cookie = 'rail=1; path=/; max-age=31536000'",
      "const e = { href: '/console/settings/shop address', key: 'shop owner' }",
      "if (x === 'Only the shop owner') y()",
      "const f = 'M16 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'",
      "const g = 'shop.accountant_invite_revoked'",
      "type T = 'the shop' | 'a store'",
    ].join('\n')
    expect(check(src, F).fails).toEqual([])
  })
  it('reads what a person reads even where code is near: toasts, field errors, reasons, JSX words, nested tags', () => {
    expect(rules("toast.error('We could not save. Check your connection; nothing was changed.')")).toEqual(['W2'])
    expect(rules("fields.set({ price: 'Add a price; it is needed.' })")).toEqual(['W2'])
    expect(rules("const r = { reason: 'This pincode is blocked.' }")).toEqual(['W4'])
    expect(rules("const a = 'Select the products from your shop.'")).toEqual(['W5'])
    expect(rules("const a = 'Delete this order from your shop?'")).toEqual(['W5'])
    expect(rules('const a = <td>pincode</td>')).toEqual(['W4'])
    expect(rules('const a = <p>Your <b>shop</b> is open</p>')).toEqual(['W5'])
    expect(rules('const a = <input type="submit" value="Save your shop" />')).toEqual(['W5'])
  })
  it('filler is read in every string, code-shaped or not, as check:voice did', () => {
    expect(rules("const a = 'hassle-free returns'")).toEqual(['filler'])
    expect(rules("throw new Error('Simply retry')")).toEqual(['filler'])
  })
  it('reads HTML entities as the marks they are, and a semicolon after a curly quote', () => {
    expect(rules('const a = <p>&ldquo;{x}&rdquo; is not in your list.</p>')).toEqual([])
    expect(rules("const a = 'Shoppers see “Opening soon”; orders are kept.'")).toEqual(['W2'])
  })
  it('a " · " line is values, each judged on its own; {\' · \'} in JSX is text', () => {
    expect(rules("const a = 'one two three four five six seven · eight nine ten eleven twelve thirteen fourteen fifteen sixteen'")).toEqual([])
    expect(rules("const a = <p>{n} orders → {d} delivered{' · '}{r} came back{' · '}{w} on the way{' · '}{s} not sent yet</p>")).toEqual([])
  })
  it('splits sentences but keeps M.R.P. and incl. whole', () => {
    expect(sentences('M.R.P. incl. taxes is ₹2,490. Save it.')).toEqual(['M.R.P. incl. taxes is ₹2,490.', 'Save it.'])
  })
  it('the allow list and the shrink-only todo', () => {
    const fails = [{ file: 'a.ts', line: 1, text: 'Vouchers for Tally', rule: 'W4', why: '' }, { file: 'b.ts', line: 2, text: 'Your shop', rule: 'W5', why: '' }]
    const allow = [{ file: 'a.ts', rule: 'W4', text: 'Vouchers for Tally', why: "Tally's own word" }, { file: 'z.ts', rule: 'W5', text: 'gone', why: '' }]
    expect(judge(fails, allow, new Map([['b.ts · W5', 1]]))).toEqual([expect.stringContaining('unused entry z.ts')])
    expect(judge(fails, [allow[0]], new Map())).toEqual([expect.stringContaining('b.ts:2')])
    expect(judge(fails, [allow[0]], new Map([['b.ts · W5', 2]]))).toEqual([expect.stringContaining('lower the line to 1')])
    expect(judge(fails, [allow[0]], new Map([['b.ts · W5', 1], ['c.ts · W1', 1]]))).toEqual([expect.stringContaining('c.ts · W1 is clean')])
  })

  it('Frrata Admin: every rule but the glossary (merchant, token are staff words); "shop" and a bare admin still fail', () => {
    const A = 'src/app/(admin)/admin/x/page.tsx'
    expect(rules(`const a = 'Open the merchant token'`, A)).not.toContain('W4')
    expect(rules(`const a = 'Open the shop'`, A)).toContain('W5')
    expect(rules(`const a = 'Ask another admin'`, A)).toContain('W6')
    expect(rules(`const a = 'Ask another master admin'`, A)).not.toContain('W6')
  })
  it('text inside <code> is code: an env name or a SQL line', () => {
    expect(rules(`const a = <p>Set <code>ADMIN_DATABASE_URL</code> in Vercel.</p>`, 'src/app/(admin)/admin/x/page.tsx')).not.toContain('W6')
  })
})

