import { z } from 'zod'
import { FOOTERS, HEADERS, PAIRINGS, type ThemeManifest } from './types'
import { ALL_PRODUCT_LAYOUTS, ALL_SECTION_SCHEMES, SECTION_KEYS, SectionSchema, VIDEO_KEYS } from './sections'
import { AnnouncementSchema } from './layer'

// =============================================================================
// FILE: src/domains/themes/manifest-schema.ts — what a theme manifest may hold (Theme Studio TS0a, spec
// docs/specs/2026-11-11-theme-studio.md § 1, ADR-0012). Every code manifest parses to itself (parity test); a studio
// manifest (TS2) is stored only after it parses. Every value is a closed choice, a bounded string or a hex colour:
// scheme colours reach a `style` attribute, so a colour is exactly `#RRGGBB` (security review H1, 2026-11-11).
// =============================================================================

export const HEX = /^#[0-9A-Fa-f]{6}$/
const hex = z.string().regex(HEX)
const word = (max: number) => z.string().min(1).max(max).regex(/^[^<>{}\\]*$/)
const slug = z.string().regex(/^[a-z0-9_-]{1,40}$/)
/** A style's key, as the database checks it (`shop_theme_revisions_style_shape`). */
const styleKey = z.string().regex(/^[a-z0-9-]{1,40}$/)

const SchemeSchema = z.object({
  bg: hex, text: hex, sub: hex, line: hex, chip: hex, accent: hex, onAccent: hex,
  button: hex, onButton: hex, good: hex, bad: hex, sale: hex,
}).strict()
const SCHEME_KEYS = ['paper', 'tint', 'ink'] as const
const StyleSchema = z.object({
  key: styleKey,
  name: word(40),
  schemes: z.object({ paper: SchemeSchema, tint: SchemeSchema.optional(), ink: SchemeSchema.optional() }).strict(),
  schemeNames: z.object({ paper: word(24).optional(), tint: word(24).optional(), ink: word(24).optional() }).strict().optional(),
}).strict()

/** Every setting's closed list of values: the one place ThemeSettings' values are spelt for data (types.ts spells them for code). */
export const SETTING_VALUES = {
  headings: ['as_typed', 'upper'],
  size: ['compact', 'regular', 'large'],
  corners: ['square', 'soft', 'round'],
  buttons: ['solid', 'outline', 'underline'],
  spacing: ['airy', 'regular', 'compact'],
  photo: ['4:5', '3:4', '1:1'],
  hoverPhoto: [true, false],
  phoneColumns: [2, 3],
  sticky: [true, false],
  bottomTabs: [true, false],
  social: [true, false],
  motion: ['subtle', 'none'],
  gallery: ['swipe', 'thumbs', 'rail', 'stack'],
  details: ['open', 'folded'],
  card: ['standard', 'centred', 'framed', 'tile'],
  desktopColumns: [3, 4],
  collectionTop: ['title', 'banner'],
  buttonShape: ['theme', 'pill'],
  buttonMotion: ['press', 'lift', 'fill'],
  cardHover: ['none', 'lift', 'zoom'],
  entrance: ['none', 'fade', 'rise'],
  reveal: [true, false],
  buyBoxSticky: [true, false],
  buyBar: [true, false],
  footerScheme: SCHEME_KEYS,
  checkout: ['standard', 'focused'],
  labels: ['none', 'pill', 'plain'],
  railCounter: [true, false],
} as const
type SettingKey = keyof typeof SETTING_VALUES
const PAGE_AND_FEEL = ['gallery', 'details', 'card', 'desktopColumns', 'collectionTop', 'buttonShape', 'buttonMotion', 'cardHover', 'entrance', 'reveal', 'buyBoxSticky', 'buyBar', 'footerScheme', 'checkout', 'labels', 'railCounter'] as const satisfies readonly SettingKey[]
const oneOf = (k: SettingKey) => z.union(SETTING_VALUES[k].map((v) => z.literal(v)) as unknown as [z.ZodLiteral<string>, z.ZodLiteral<string>])


const base = Object.fromEntries((Object.keys(SETTING_VALUES) as SettingKey[]).filter((k) => !(PAGE_AND_FEEL as readonly string[]).includes(k)).map((k) => [k, oneOf(k)]))
const optional = Object.fromEntries(PAGE_AND_FEEL.map((k) => [k, oneOf(k).optional()]))
const DefaultsSchema = z.object({
  ...base,
  ...optional,
  pairing: z.enum(PAIRINGS),
  header: z.enum(HEADERS),
  footer: z.enum(FOOTERS),
  announcement: AnnouncementSchema.nullable(),
  brandColour: hex.nullable(),
}).strict()

const ChoicesSchema = z.object(Object.fromEntries((Object.keys(SETTING_VALUES) as SettingKey[]).map((k) => [k, z.array(oneOf(k)).min(1).max(SETTING_VALUES[k].length).optional()]))).strict()

const AllowedSchema = z.object({
  pairings: z.array(z.enum(PAIRINGS)).min(1),
  headers: z.array(z.enum(HEADERS)).min(1),
  footers: z.array(z.enum(FOOTERS)).min(1),
  sections: z.array(z.enum(SECTION_KEYS as [string, ...string[]])).min(1),
  heroMasks: z.array(z.enum(['none', 'arch'])).optional(),
  productLayouts: z.array(z.enum(ALL_PRODUCT_LAYOUTS)).optional(),
  sectionSchemes: z.array(z.enum(ALL_SECTION_SCHEMES)).optional(),
  videoSections: z.array(z.enum(VIDEO_KEYS)).optional(),
  imageTextLayouts: z.array(z.literal('spotlight')).optional(),
  heroScript: z.boolean().optional(),
  productStories: z.boolean().optional(),
  pairWith: z.boolean().optional(),
  choices: ChoicesSchema.optional(),
}).strict()

const MadeSchema = z.object({
  headers: z.array(z.enum(HEADERS)).optional(),
  footers: z.array(z.enum(FOOTERS)).optional(),
  sections: z.array(z.enum(SECTION_KEYS as [string, ...string[]])).optional(),
}).strict()

/** Photos a manifest may name: Frrata's own samples (code themes); a studio theme's own folder joins in TS2. */
export const MANIFEST_IMAGE = /^\/themes\/samples\/[a-z0-9/-]{1,120}$/
const imageBases = (v: unknown, out: string[] = []): string[] => {
  if (Array.isArray(v)) v.forEach((x) => imageBases(x, out))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (k === 'base' && typeof x === 'string') out.push(x); else imageBases(x, out) }
  return out
}
/** A home section is validated by the section library's own schema, and kept as written (its defaults apply at render,
 *  so the parsed manifest is the manifest: parity). Its photos come only from Frrata's samples. */
const HomeSectionSchema = z.record(z.string(), z.unknown()).superRefine((v, ctx) => {
  const r = SectionSchema.safeParse(v)
  if (!r.success) ctx.addIssue({ code: 'custom', message: `home section ${String(v.id ?? '?')}: ${r.error.issues[0]?.message ?? 'invalid'}` })
  for (const b of imageBases(v)) if (!MANIFEST_IMAGE.test(b)) ctx.addIssue({ code: 'custom', message: `home section ${String(v.id ?? '?')}: a photo outside Frrata's samples` })
})

export const ManifestSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]{1,48}$/),
  version: z.string().regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}$/),
  name: word(40),
  job: word(200),
  goodFor: z.array(slug).max(12),
  features: z.array(word(200)).max(20),
  styles: z.array(StyleSchema).min(1).max(5),
  defaults: DefaultsSchema,
  allowed: AllowedSchema,
  samples: z.enum(['festive', 'studio', 'signal']).optional(),
  made: MadeSchema.optional(),
  rhythm: z.literal('even').optional(),
  scale: z.literal('signal').optional(),
  home: z.array(HomeSectionSchema).max(20),
}).strict()

/** A manifest from data, or a refusal in words (the first problems; never more than 5). */
export function parseManifest(input: unknown): { ok: true; manifest: ThemeManifest } | { ok: false; problems: string[] } {
  const r = ManifestSchema.safeParse(input)
  if (r.success) return { ok: true, manifest: r.data as unknown as ThemeManifest }
  return { ok: false, problems: r.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || 'manifest'}: ${i.message}`) }
}
