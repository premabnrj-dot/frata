import 'server-only'
import { cookies } from 'next/headers'

// The store's Storefront API, read on the server only. The key never reaches the browser (scripts/scan-bundle.mjs).
// Answers are cached 60 s per address; Frrata purges its own copies when the store changes.
const ORIGIN = process.env.FRRATA_API_ORIGIN || 'https://api.frrata.shop'
const KEY = process.env.FRRATA_KEY || ''
const VERSION = '2026-12'
// A test key (frs_test_…, before the store opens) reads drafts too. On your computer it is never cached, so an edit
// shows at once; deployed (a preview), its reads are kept 15 s so a busy preview stays inside the key's limit.
const DEPLOYED = !!process.env.VERCEL // Vercel sets it at build and at run; nothing sets it on your computer
const READ: RequestInit = KEY.startsWith('frs_test_') ? (DEPLOYED ? { next: { revalidate: 15 } } : { cache: 'no-store' }) : { next: { revalidate: 60 } }
export const PREVIEW_COOKIE = '__Host-frrata-preview'

export type Image = { sizes: { width: number; url: string }[]; width: number; height: number; alt: string; colour: string | null }
export type Availability = { kind: string; left: number | null; shipsBy: string | null; leadDays: [number, number] | null }
export type Card = { id: string; handle: string; title: string; price: { min: number; max: number; priorPrice: number | null } | null; availability: Availability | null; image: Image | null; badge: string | null }
export type Variant = { id: string; values: string[]; price: number; priorPrice: number | null; mrp: number | null; availability: Availability }
export type Product = Card & { description: string; options: string[]; variants: Variant[]; images: Image[]; details: { name: string; value: string }[] }
export type Shop = {
  name: string; tagline: string; status: string; checkoutOrigin: string; cart?: { url: string; maxLines: number; maxQty: number }
  legal: { legalName: string; address: string; customerCare: { email: string; phone: string }; grievanceOfficer: { name: string; role: string; email: string; phone: string } }
  policies: { kind: string; title: string; url: string }[]; social: { instagram: string | null; whatsapp: string | null }; payOnDelivery: { on: boolean }
  /** The main logo, never an SVG (an SVG logo comes here as its PNG once made, else null). Every logo file is in brand. */
  logo: string | null
  /** The store's brand record (Console › Brand). Draw the site from it: <BrandStyle> and <Logo>, never copies in code. */
  brand?: Brand | null
}
export type Brand = {
  logos: { main: string | null; mark: string | null; stacked: string | null; reversed: string | null }
  colours: { background: string; panel: string; text: string; secondaryText: string; accent: string; onAccent: string; controlEdge: string; hairline: string; success: string; warning: string; error: string }
  fonts: { headings: string; body: string }
  radius: number
  density: string
  season: { name: string; until: string | null } | null
}
type Run = { text: string; bold: boolean; italic: boolean; link: string | null }
export type FaqItem = { question: string; answer: string | null; policy: string | null }
export type Block = { kind: string; level?: number; text?: string; paragraphs?: Run[][]; image?: Image; label?: string; link?: string; items?: FaqItem[]; blocks?: Block[] }
export type StorePage = { handle: string; title: string; blocks: Block[] }
export type Faq = { handle: string; title: string; items: FaqItem[] }

/** One read. Null for any 404 (unknown, deleted, hidden: the API gives one answer for all). */
export async function api<T>(path: string): Promise<T | null> {
  if (!KEY) throw new Error('FRRATA_KEY is not set')
  const res = await fetch(`${ORIGIN}/${VERSION}/k/${KEY}/${path}`, READ)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Frrata ${res.status}`)
  return res.json() as Promise<T>
}

/** A hidden page while the brand previews it (/frrata-preview set the cookie): never cached, the token in a header. */
export async function previewOr<T>(path: string): Promise<T | null> {
  const token = (await cookies()).get(PREVIEW_COOKIE)?.value
  if (!token) return api<T>(path)
  const res = await fetch(`${ORIGIN}/${VERSION}/k/${KEY}/preview/${path}`, { cache: 'no-store', headers: { 'Frrata-Preview': token } })
  return res.ok ? (res.json() as Promise<T>) : api<T>(path)
}

export { rupees } from './money'
