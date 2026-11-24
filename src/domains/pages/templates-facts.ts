// =============================================================================
// FILE: src/domains/pages/templates-facts.ts — the half of templates.ts a browser may load: the template names, the
// FAQ's cap and a page's address rule, no zod (page weight, 2026-11-23: Console › Content's page and FAQ forms read
// these and shipped all of zod). templates.ts re-exports everything here.
// =============================================================================

export const PAGE_TEMPLATES = ['about', 'faq'] as const
export type PageTemplate = (typeof PAGE_TEMPLATES)[number]
/** The FAQ's own block: questions, some bound to Settings. */
export const FAQ_ID = 'questions'
export const MAX_FAQ = 12
export const TEMPLATE_NAMES: Record<PageTemplate, string> = { about: 'About', faq: 'FAQ' }
export const HANDLE = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/
export const handleOf = (title: string) => title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '') || 'page'
