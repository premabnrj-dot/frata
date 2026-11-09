'use client'

import Link from 'next/link'
import { BRAND_COLOUR_PICKS as BRAND_PICKS, BRAND_COLOUR_START } from '@/domains/themes/catalogue/kit'
import type { Choices } from '@/domains/themes/choices'
import { brandColourProblem } from '@/domains/themes/layer'
import { FOOTER_NAMES, HEADER_NAMES, PAIRING_NAMES, type Announcement, type FooterVariant, type HeaderVariant, type Pairing, type Scheme, type ThemeSettings } from '@/domains/themes/types'
import { Field, Group, LinkPicker, Offered, OfferedSwitch, Segmented, Switch, Text, Tiles, type LinkTarget } from './controls'

// =============================================================================
// "Style" (Look v3; themes spec § Theme settings, every control): groups that open and close, each saying what it
// is set to; colour styles as colour bars, buttons as real buttons that show their hover, headers and footers as
// pictures with "Made for <theme>". Typed choices only; the brand colour is the one free value, checked as it is
// picked against the style's light schemes. A choice the theme offers one value for isn't shown (choicesFor).
// =============================================================================

export type StyleOption = { key: string; name: string; swatches: string[]; light: Scheme[] }

const ic = (d: string) => <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current stroke-[1.8]" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
const ICONS = {
  colour: ic('M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.6 0-1.3-1-1.7-1-2.9 0-1 .8-1.5 1.8-1.5H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z'),
  type: ic('M4 7V5h16v2M9 19h6M12 5v14'), shape: ic('M4 4h7v7H4zM13 13h7v7h-7z'), button: ic('M3 8h18v8H3zM8 12h8'),
  products: ic('M4 4h7v9H4zM13 4h7v9h-7zM4 16h7M13 16h7'), header: ic('M3 4h18v16H3zM3 9h18'), footer: ic('M3 4h18v16H3zM3 15h18'),
  motion: ic('M4 12h10M4 7h6M4 17h6M16 8l4 4-4 4'),
}

export function ThemeForm({ settings, style, styles, allowed, made, themeName, choices, schemes, targets, fonts, set, setStyle, onPage, paletteOn = false, openSite }: {
  settings: ThemeSettings; style: string; styles: StyleOption[]
  allowed: { pairings: Pairing[]; headers: HeaderVariant[]; footers: FooterVariant[] }
  made: { headers?: HeaderVariant[]; footers?: FooterVariant[] }; themeName: string
  choices: Choices; schemes: { key: 'paper' | 'tint' | 'ink'; name: string }[]
  targets: LinkTarget[]; fonts: Record<Pairing, string>
  set: (s: Partial<ThemeSettings>) => void; setStyle: (k: string) => void
  /** Page-aware (Look v4): a group about a page opens that page in the preview. */
  onPage?: (page: 'home' | 'collection') => void
  /** Site settings › Colours is on (Look v4): it sets the accent, so the brand colour here steps aside. */
  paletteOn?: boolean; openSite?: () => void
}) {
  const current = styles.find((s) => s.key === style) ?? styles[0]!
  const brandWhy = settings.brandColour ? brandColourProblem(settings.brandColour, current.light) : null
  const ann: Announcement = settings.announcement ?? { text: '', link: null, scheme: 'paper' }
  // Designs made for this theme first.
  const first = <T extends string>(xs: T[], m: T[] = []) => [...xs].sort((a, b) => Number(m.includes(b)) - Number(m.includes(a)))
  const badge = (m: string[] | undefined, v: string) => (m?.includes(v) ? `Made for ${themeName}` : undefined)
  const motionLabel = settings.motion === 'none' ? 'None' : [settings.entrance !== 'none' && (settings.entrance === 'fade' ? 'Fade' : 'Rise'), settings.reveal && 'Rise in'].filter(Boolean).join(' · ') || 'Subtle'
  return (
    <div>
      <Group title="Colours" icon={ICONS.colour} value={settings.brandColour ? `${current.name} · own colour` : current.name} open>
        <div role="radiogroup" aria-label="Style" className="grid gap-2">
          {styles.map((s) => (
            <button key={s.key} type="button" role="radio" aria-checked={s.key === style} onClick={() => setStyle(s.key)}
              className={`flex min-h-12 items-center gap-3 rounded-xl border px-3 text-left text-sm transition-[border-color] duration-fast ${s.key === style ? 'border-foreground shadow-[inset_0_0_0_1px_var(--color-foreground)]' : 'border-border hover:border-input'}`}>
              <span className="flex h-7 w-20 overflow-hidden rounded-md border border-border" aria-hidden="true">{s.swatches.map((c, i) => <span key={i} className="flex-1" style={{ background: c }} />)}</span>
              <span className="font-medium">{s.name}</span>
              <svg viewBox="0 0 24 24" aria-hidden="true" className={`ml-auto size-4 fill-none stroke-current stroke-2 transition-[opacity,scale] duration-base ease-snap ${s.key === style ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}><path d="M5 12l5 5 9-10" /></svg>
            </button>
          ))}
        </div>
        {paletteOn ? <button type="button" onClick={openSite} className="flex min-h-10 w-full items-center justify-between rounded-md border border-input px-3 text-sm">Your palette is in Site settings<span aria-hidden="true">›</span></button> :
        <div className="space-y-2">
          <Switch label="My own brand colour" on={!!settings.brandColour} onChange={(on) => set({ brandColour: on ? BRAND_COLOUR_START : null })} />
          {settings.brandColour && <>
            <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Brand colour">
              {BRAND_PICKS.map((c) => <button key={c} type="button" role="radio" aria-checked={settings.brandColour === c} aria-label={c} onClick={() => set({ brandColour: c })}
                className={`size-8 rounded-full border-2 border-card transition-[scale] duration-fast ease-snap hover:scale-110 ${settings.brandColour === c ? 'ring-2 ring-foreground' : 'ring-1 ring-border'}`} style={{ background: c }} />)}
              <Field label="Any colour">{(id) => <input id={id} type="color" value={settings.brandColour!} onChange={(e) => set({ brandColour: e.target.value.toUpperCase() as `#${string}` })} className="h-8 w-12 cursor-pointer rounded-md border border-input" aria-invalid={!!brandWhy} />}</Field>
            </div>
            {brandWhy && <p role="alert" className="text-sm text-danger-text">{brandWhy}</p>}
          </>}
        </div>}
      </Group>

      <Group title="Type" icon={ICONS.type} value={PAIRING_NAMES[settings.pairing]}>
        <div role="radiogroup" aria-label="Type" className="grid grid-cols-2 gap-2">
          {allowed.pairings.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={settings.pairing === p} onClick={() => set({ pairing: p })}
              className={`grid min-h-16 place-items-center gap-0.5 rounded-xl border px-3 py-2 transition-[border-color,scale] duration-fast active:scale-[0.97] ${settings.pairing === p ? 'border-foreground shadow-[inset_0_0_0_1px_var(--color-foreground)]' : 'border-border hover:border-input'}`}>
              <span className="text-2xl leading-none" style={{ fontFamily: fonts[p] }}>Aa</span><span className="text-xs text-muted-foreground">{PAIRING_NAMES[p]}</span>
            </button>
          ))}
        </div>
        <div className="space-y-1.5"><p className="text-sm font-medium">Size</p><Segmented label="Type size" full value={settings.size} onChange={(size) => set({ size })} options={[{ value: 'compact', label: 'Compact' }, { value: 'regular', label: 'Regular' }, { value: 'large', label: 'Large' }]} /></div>
        <div className="space-y-1.5"><p className="text-sm font-medium">Headings</p><Segmented label="Headings" full value={settings.headings} onChange={(headings) => set({ headings })} options={[{ value: 'as_typed', label: 'As typed' }, { value: 'upper', label: 'UPPERCASE' }]} /></div>
      </Group>

      <Group title="Shape and space" icon={ICONS.shape} value={`${{ square: 'Square', soft: 'Soft', round: 'Round' }[settings.corners]} · ${{ airy: 'Airy', regular: 'Regular', compact: 'Compact' }[settings.spacing]}`}>
        <Offered label="Corners" value={settings.corners} list={choices.corners} onChange={(corners) => set({ corners })} all={[{ value: 'square', label: 'Square' }, { value: 'soft', label: 'Soft' }, { value: 'round', label: 'Round' }]} />
        <div className="space-y-1.5"><p className="text-sm font-medium">Spacing</p><Segmented label="Spacing" full value={settings.spacing} onChange={(spacing) => set({ spacing })} options={[{ value: 'airy', label: 'Airy' }, { value: 'regular', label: 'Regular' }, { value: 'compact', label: 'Compact' }]} /></div>
      </Group>

      <Group title="Buttons" icon={ICONS.button} value={`${{ solid: 'Solid', outline: 'Outline', underline: 'Underlined' }[settings.buttons]} · ${{ press: 'Press', lift: 'Lift', fill: 'Sheen' }[settings.buttonMotion]}`}>
        <Tiles label="Style" value={settings.buttons} onChange={(buttons) => set({ buttons })}
          options={(choices.buttons ?? ['solid', 'outline', 'underline']).map((v) => ({ value: v, label: { solid: 'Solid', outline: 'Outline', underline: 'Underlined' }[v], picture: <DemoButton look={v} /> }))} />
        <Tiles label="On hover" value={settings.buttonMotion} onChange={(buttonMotion) => set({ buttonMotion })}
          options={(choices.buttonMotion ?? ['press', 'lift', 'fill']).map((v) => ({ value: v, label: { press: 'Press', lift: 'Lift', fill: 'Sheen' }[v], picture: <DemoButton look="solid" motion={v} /> }))} />
        <Offered label="Shape" value={settings.buttonShape} list={choices.buttonShape} onChange={(buttonShape) => set({ buttonShape })} all={[{ value: 'theme', label: 'Follows corners' }, { value: 'pill', label: 'Pill' }]} />
      </Group>

      <Group title="Products" icon={ICONS.products} onOpen={() => onPage?.('collection')} value={`${settings.photo} · ${settings.phoneColumns} on a phone`}>
        <div className="space-y-1.5"><p className="text-sm font-medium">Photo shape</p><Segmented label="Photo shape" full value={settings.photo} onChange={(photo) => set({ photo, ...(photo === '4:5' ? { phoneColumns: 2 as const } : {}) })} options={[{ value: '4:5', label: '4:5' }, { value: '3:4', label: '3:4' }, { value: '1:1', label: '1:1' }]} /></div>
        <Offered label="Columns on a phone" value={settings.phoneColumns} list={choices.phoneColumns} onChange={(phoneColumns) => set({ phoneColumns })} all={[{ value: 2, label: '2' }, ...(settings.photo === '4:5' ? [] : [{ value: 3 as const, label: '3' }])]} />
        <Offered label="Cards on hover" value={settings.cardHover} list={choices.cardHover} onChange={(cardHover) => set({ cardHover })} all={[{ value: 'none', label: 'Still' }, { value: 'lift', label: 'Lift' }, { value: 'zoom', label: 'Zoom photo' }]} />
        <Switch label="Second photo on hover (computers)" on={settings.hoverPhoto} onChange={(hoverPhoto) => set({ hoverPhoto })} />
      </Group>

      <Group title="Header" icon={ICONS.header} onOpen={() => onPage?.('home')} value={HEADER_NAMES[settings.header]}>
        <Tiles label="Design" cols={2} value={settings.header} onChange={(header) => set({ header })}
          options={first(allowed.headers, made.headers).map((h) => ({ value: h, label: HEADER_NAMES[h], picture: <HeaderPicture v={h} />, badge: badge(made.headers, h) }))} />
        <Switch label="Stays at the top when scrolling" on={settings.sticky} onChange={(sticky) => set({ sticky })} />
        <Switch label="Tabs at the bottom on phones" on={settings.bottomTabs} onChange={(bottomTabs) => set({ bottomTabs })} />
        <div className="space-y-2">
          <Switch label="Announcement bar" on={!!settings.announcement} onChange={(on) => set({ announcement: on ? { text: 'Free shipping above ₹1,999', link: null, scheme: 'paper' } : null })} />
          {settings.announcement && <>
            <Text label="Announcement" value={ann.text} max={80} onChange={(text) => set({ announcement: { ...ann, text } })} />
            <LinkPicker label="Goes to" value={ann.link} targets={targets} onChange={(link) => set({ announcement: { ...ann, link } })} />
          </>}
        </div>
        <p className="text-sm text-muted-foreground">Logo: <Link href="/console/settings/brand" className="underline underline-offset-4">Settings › Brand</Link></p>
      </Group>

      <Group title="Footer" icon={ICONS.footer} onOpen={() => onPage?.('home')} value={FOOTER_NAMES[settings.footer]}>
        <Tiles label="Design" cols={2} value={settings.footer} onChange={(footer) => set({ footer })}
          options={first(allowed.footers, made.footers).map((f) => ({ value: f, label: FOOTER_NAMES[f], picture: <FooterPicture v={f} />, badge: badge(made.footers, f) }))} />
        <Offered label="Colours" value={settings.footerScheme} list={choices.footerScheme} onChange={(footerScheme) => set({ footerScheme })} all={schemes.map((x) => ({ value: x.key, label: x.name }))} />
        <Switch label="Instagram and WhatsApp links" on={settings.social} onChange={(social) => set({ social })} />
      </Group>

      <Group title="Motion" icon={ICONS.motion} value={motionLabel}>
        <div className="space-y-1.5"><p className="text-sm font-medium">Motion</p><Segmented label="Motion" full value={settings.motion} onChange={(motion) => set({ motion })} options={[{ value: 'subtle', label: 'Subtle' }, { value: 'none', label: 'None' }]} /></div>
        {settings.motion !== 'none' && <>
          <Offered label="Pages arrive" value={settings.entrance} list={choices.entrance} onChange={(entrance) => set({ entrance })} all={[{ value: 'none', label: 'At once' }, { value: 'fade', label: 'Fade' }, { value: 'rise', label: 'Rise' }]} />
          <OfferedSwitch label="Sections rise in as you scroll" on={settings.reveal} list={choices.reveal} onChange={(reveal) => set({ reveal })} />
        </>}
      </Group>

    </div>
  )
}

/** A shop button drawn in the console, showing a style or, on hover, a motion (decorative: the tile is labelled). */
function DemoButton({ look, motion }: { look: 'solid' | 'outline' | 'underline'; motion?: 'press' | 'lift' | 'fill' }) {
  const base = look === 'underline' ? 'border-b border-current px-0 py-0.5' : look === 'outline' ? 'border border-current px-3 py-1.5' : 'bg-foreground px-3 py-1.5 text-background'
  const move = motion === 'press' ? 'transition-[scale] duration-fast group-hover:scale-95' : motion === 'lift' ? 'transition-[translate] duration-base ease-standard group-hover:-translate-y-1' : ''
  return (
    <span aria-hidden="true" className={`relative isolate overflow-hidden text-[0.625rem] font-semibold uppercase tracking-[0.12em] ${base} ${move}`}>
      {motion === 'fill' && <span className="absolute inset-0 -z-10 origin-left scale-x-0 bg-background/25 transition-transform duration-slow ease-standard group-hover:scale-x-100" />}Shop
    </span>
  )
}

const bar = (x: number, y: number, w: number, h: number, o = 0.7, k?: string) => <rect key={k ?? `${x}${y}${w}`} x={x} y={y} width={w} height={h} rx={1} fill="currentColor" opacity={o} />
/** Each header design, drawn (decorative). */
export function HeaderPicture({ v }: { v: HeaderVariant }) {
  const b: Record<HeaderVariant, React.ReactNode> = {
    classic: <>{bar(8, 10, 28, 5)}{bar(64, 11, 30, 3, 0.4)}{bar(100, 10, 10, 5)}</>,
    centred: <>{bar(8, 10, 8, 5)}{bar(44, 9, 32, 6)}{bar(104, 10, 8, 5)}{bar(34, 22, 52, 2.5, 0.35)}</>,
    minimal: <>{bar(8, 10, 8, 5)}{bar(48, 10, 24, 4)}{bar(100, 10, 12, 5)}</>,
    circles: <>{bar(8, 8, 28, 5)}{bar(100, 8, 10, 5)}{[0, 1, 2, 3].map((i) => <circle key={i} cx={16 + i * 18} cy={28} r={6} fill="none" stroke="currentColor" strokeWidth={1.5} opacity={0.7} />)}</>,
    split: <>{bar(8, 11, 30, 3, 0.45)}{bar(46, 9, 28, 6)}{bar(104, 10, 8, 5)}</>,
    panel: <>{bar(8, 8, 8, 5)}{bar(44, 7, 32, 6)}{bar(104, 8, 8, 5)}{bar(8, 18, 104, 22, 0.15)}{[0, 1, 2].map((i) => bar(14 + i * 34, 22, 26, 14, 0.35, `p${i}`))}</>,
    overlay: <>{bar(0, 0, 120, 44, 0.28)}{bar(8, 9, 8, 5, 1)}{bar(44, 8, 32, 6, 1)}{bar(104, 9, 8, 5, 1)}</>,
  }
  return <svg viewBox="0 0 120 44" className="h-11 w-full text-foreground" aria-hidden="true">{b[v]}</svg>
}
/** Each footer design, drawn (decorative). */
export function FooterPicture({ v }: { v: FooterVariant }) {
  const b: Record<FooterVariant, React.ReactNode> = {
    three: <>{[0, 1, 2].map((i) => <g key={i}>{bar(8 + i * 38, 10, 28, 4)}{bar(8 + i * 38, 18, 22, 3, 0.4)}{bar(8 + i * 38, 24, 24, 3, 0.4)}</g>)}</>,
    compact: <>{bar(40, 10, 40, 4)}{bar(24, 20, 72, 3, 0.4)}{bar(32, 28, 56, 3, 0.4)}</>,
    statement: <>{bar(8, 8, 30, 3, 0.4)}{bar(64, 8, 20, 3, 0.4)}{bar(90, 8, 22, 3, 0.4)}{bar(8, 22, 76, 14, 0.9)}</>,
    gram: <>{[0, 1, 2, 3, 4].map((i) => bar(8 + i * 21.5, 6, 18, 18, 0.35, `g${i}`))}{bar(36, 30, 48, 3, 0.5)}{bar(28, 37, 64, 2.5, 0.3)}</>,
  }
  return <svg viewBox="0 0 120 44" className="h-11 w-full text-foreground" aria-hidden="true">{b[v]}</svg>
}
