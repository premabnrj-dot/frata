// =============================================================================
// FILE: src/domains/settings/groups.ts — SETTINGS IN FIVE GROUPS (owner, 2026-11-15; mockup
// https://claude.ai/artifact/GGkvYuwqxL7YEoXxAjbYLD, docs/mockups/2026-11-15-neel-settings/). Pick a group, its pages
// appear; a page names its group and shows the group's other pages as tabs. Who may open each page is said once here
// (the page itself still checks with requireMember). Pure.
// =============================================================================

import { CAN_BUILD, CAN_MANAGE, CAN_SET_COSTS, CAPABILITIES, CONSOLE_ROLES, type MemberRole } from '@/domains/tenancy/roles'
import { SECTIONS, type SectionKey } from './sections'

export type PageKey = SectionKey | 'web-address' | 'website' | 'online-payments' | 'shipping-costs' | 'emails' | 'notifications' | 'people' | 'billing'
export type GroupKey = 'store' | 'checkout' | 'tax' | 'messages' | 'team'

export type SettingsGroup = { key: GroupKey; name: string; sub: string; pages: readonly PageKey[] }

export const GROUPS: readonly SettingsGroup[] = [
  { key: 'store', name: 'Store', sub: 'Details, web address, website, contact, policies', pages: ['store', 'web-address', 'website', 'contact', 'policies'] },
  { key: 'checkout', name: 'Checkout', sub: 'Online payments, Pay on delivery, shipping', pages: ['online-payments', 'payments', 'shipping'] },
  { key: 'tax', name: 'Business and tax', sub: 'GST, invoices and slips, your costs', pages: ['business', 'invoices', 'shipping-costs'] },
  { key: 'messages', name: 'Messages', sub: 'Emails to shoppers, your notifications', pages: ['emails', 'notifications'] },
  { key: 'team', name: 'Team and plan', sub: 'People, plan and billing', pages: ['people', 'billing'] },
]

const OTHER: Record<Exclude<PageKey, SectionKey>, { title: string; roles: readonly MemberRole[] }> = {
  'web-address': { title: 'Web address', roles: CAN_MANAGE },
  // V1 Storefront API (ADR-0018): who holds api.manage opens it; who may change it is decided on the page (a partner
  // only while the store has no owner, never a support visit), and the rest see it read-only.
  website: { title: 'Website', roles: CAPABILITIES['api.manage'] },
  'online-payments': { title: 'Online payments', roles: ['owner'] },
  'shipping-costs': { title: 'Your shipping costs', roles: CAN_SET_COSTS },
  emails: { title: 'Emails to shoppers', roles: CONSOLE_ROLES },
  notifications: { title: 'Your notifications', roles: CONSOLE_ROLES },
  people: { title: 'People', roles: CAN_MANAGE },
  billing: { title: 'Plan and billing', roles: CAN_MANAGE },
}

const section = (k: PageKey) => SECTIONS.find((s) => s.key === k)

export const pageTitle = (k: PageKey): string => section(k)?.title ?? OTHER[k as Exclude<PageKey, SectionKey>].title
export const pageHref = (k: PageKey): string => `/console/settings/${k}`
export const pageRoles = (k: PageKey): readonly MemberRole[] => section(k)?.editors ?? OTHER[k as Exclude<PageKey, SectionKey>].roles
export const mayOpen = (k: PageKey, role: MemberRole): boolean => pageRoles(k).includes(role)
export const groupOf = (k: PageKey): SettingsGroup => GROUPS.find((g) => g.pages.includes(k))!
export const groupFor = (key: string | undefined): SettingsGroup | undefined => GROUPS.find((g) => g.key === key)

/** The settings list is for whoever builds the store; a group shows only the pages this person may open. */
export const groupsFor = (role: MemberRole): { group: SettingsGroup; pages: PageKey[] }[] =>
  (CAN_BUILD as readonly MemberRole[]).includes(role)
    ? GROUPS.map((group) => ({ group, pages: group.pages.filter((p) => mayOpen(p, role)) })).filter((g) => g.pages.length)
    : []

/** Old addresses, kept working: bookmarks, emails, the live-payments checklist. */
const MOVED_PAGES: Record<string, PageKey> = { brand: 'store', taxes: 'business', documents: 'invoices', address: 'web-address' }
/** Own keys only: "constructor" is not an old address. */
export const movedTo = (key: string): PageKey | null => (Object.hasOwn(MOVED_PAGES, key) ? MOVED_PAGES[key]! : null)
