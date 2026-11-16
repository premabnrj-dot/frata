// =============================================================================
// FILE: src/domains/storefront-api/2026-12/content-map.ts
//
// THE STORE'S CONTENT AND PAGES → VERSION 2026-12's ANSWERS (V1 SA1; spec 2026-11-14-site-content-layer § Storefront
// API additions). Field by field, never spread. Every rule is the store's own: the bar's order (content/bar.ts), a
// dated entry's state (content/schedule.ts), what a page shows a shopper (pages/page.ts resolvePage in 'shop' mode:
// never a sample or an example), a bound answer (policies/answers.ts). A bar that starts later is never returned; each
// carries its end, so a site hides it on time. Links are the store's own paths only; photos only from Frrata's store.
// Pure: `now` is passed.
// =============================================================================

import type { z } from 'zod'
import { writtenOrder } from '../../content/bar'
import type { StoreContent } from '../../content/kinds'
import type { MenuItem } from '../../themes/site'
import { ICON_NAMES } from '../../icons/names'
import { SHOP_PATH } from '../../themes/sections'
import type { PageNode } from '../../pages/page'
import type { PageTemplate } from '../../pages/templates'
import { imageOut, plain, type MapCtx } from './map'
import type * as S from './schemas'
import { POLICY_KINDS } from './schemas'

type In<T extends z.ZodType> = z.input<T>
type Link1 = In<typeof S.Content>['menus']['main'] extends (infer L)[] | null ? L : never

const path = (s: string | null | undefined): string | null => (s && SHOP_PATH.test(s) ? s : null)
const iso = (d: Date | null) => (d ? d.toISOString() : null)

/** A menu as the store keeps it, three levels at most, any link off the store's own paths dropped with its children. */
function menuOut(items: MenuItem[] | undefined): Link1[] | null {
  if (!items) return null
  const base = (x: MenuItem) => { const link = path(x.link); return link ? { label: plain(x.label, 40), link, icon: (ICON_NAMES as readonly string[]).includes(x.icon ?? '') ? x.icon : null } : null }
  return items.slice(0, 12).flatMap((a) => {
    const l1 = base(a)
    if (!l1) return []
    const children = a.children.slice(0, 12).flatMap((b) => {
      const l2 = base(b)
      if (!l2) return []
      return [{ ...l2, children: b.children.slice(0, 12).flatMap((c) => base(c) ?? []) }]
    })
    return [{ ...l1, children }]
  })
}

export type PageListIn = { handle: string; title: string; template: PageTemplate }[]

/** The store's content: live bars in the order the store shows them, its menus, the Contact line, its live pages. */
export function contentOut(c: StoreContent, pages: PageListIn, now: Date): In<typeof S.Content> {
  return {
    announcements: writtenOrder(c.bars, now).slice(0, 3).map((b) => ({ text: plain(b.text, 120), link: path(b.link), scheme: b.scheme, endsAt: iso(b.endsAt) })),
    menus: { main: menuOut(c.menus.main), footer: menuOut(c.menus.footer), tabs: menuOut(c.menus.tabs) },
    contact: c.contact ? plain(c.contact.line, 160) || null : null,
    pages: pages.slice(0, 20).map((p) => ({ handle: p.handle, title: plain(p.title, 120), kind: p.template })),
  }
}

type Block = In<typeof S.StorePage>['blocks'][number]
type Leaf = Extract<Block, { kind: 'heading' | 'text' | 'image' | 'button' | 'questions' }>
type FaqItemOut = In<typeof S.FaqItem>
const policyOf = (href: string) => { const k = /^\/policies\/([a-z]+)$/.exec(href)?.[1]; return (POLICY_KINDS as readonly string[]).includes(k ?? '') ? k as FaqItemOut['policy'] : undefined }

/** One question as a page shows it: its words, or (a bound answer the owner rewrote) a pointer to the policy. */
export function faqItemOut(i: { q: string; a: string; href?: string }): FaqItemOut {
  const pol = i.href ? policyOf(i.href) : undefined
  return pol ? { question: plain(i.q, 80), answer: null, policy: pol } : { question: plain(i.q, 80), answer: plain(i.a, 1200), policy: null }
}

function leafOut(m: MapCtx, n: PageNode): Leaf | null {
  switch (n.kind) {
    case 'heading': return { kind: 'heading', level: n.level, text: plain(n.text, 60) }
    case 'text': return { kind: 'text', paragraphs: n.body.slice(0, 12).map((p) => p.slice(0, 40).map((r) => ({ text: plain(r.text, 600), bold: !!r.bold, italic: !!r.italic, link: path(r.link) }))) }
    case 'image': { const image = imageOut(m, n.image); return image ? { kind: 'image', ratio: n.ratio, image } : null }
    case 'button': { const link = path(n.link); return link ? { kind: 'button', label: plain(n.label, 24), link } : null }
    case 'accordion': return { kind: 'questions', items: n.items.slice(0, 12).map(faqItemOut) }
    case 'faq': return { kind: 'questions', items: n.items.slice(0, 12).map(faqItemOut) }
    // Commerce, video and date blocks are not in a page's templates (about, faq): none in this version.
    default: return null
  }
}

/** A page's blocks, top to bottom: what the store's own page shows a shopper, nothing more. */
export function pageBlocksOut(m: MapCtx, nodes: PageNode[]): Block[] {
  return nodes.slice(0, 100).flatMap((n): Block[] => {
    if (n.kind === 'group') { const blocks = n.children.flatMap((c) => leafOut(m, c) ?? []); return blocks.length ? [{ kind: 'group', blocks }] : [] }
    if (n.kind === 'columns') {
      const blocks = n.children.flatMap((c): (Leaf | Extract<Block, { kind: 'group' }>)[] => {
        if (c.kind === 'group') { const b = c.children.flatMap((x) => leafOut(m, x) ?? []); return b.length ? [{ kind: 'group', blocks: b }] : [] }
        return [leafOut(m, c)].flatMap((x) => x ?? [])
      })
      return blocks.length ? [{ kind: 'columns', phone: n.phone, blocks }] : []
    }
    return [leafOut(m, n)].flatMap((x) => x ?? [])
  })
}

export function storePageOut(m: MapCtx, p: { handle: string; title: string; template: PageTemplate }, nodes: PageNode[]): In<typeof S.StorePage> {
  return { handle: p.handle, title: plain(p.title, 120), kind: p.template, blocks: pageBlocksOut(m, nodes) }
}

/** The store's FAQ: its questions with answers, bound ones answered from Settings (or pointing at the policy). */
export function faqOut(p: { handle: string; title: string }, nodes: PageNode[]): In<typeof S.Faq> {
  const f = nodes.find((n) => n.kind === 'faq')
  return { handle: p.handle, title: plain(p.title, 120), items: f && f.kind === 'faq' ? f.items.slice(0, 12).map(faqItemOut) : [] }
}
