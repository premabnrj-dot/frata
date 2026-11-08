'use client'

import Link from 'next/link'
import { BRAND_COLOUR_START } from '@/domains/themes/catalogue/kit'
import { brandColourProblem } from '@/domains/themes/layer'
import { FOOTER_NAMES, HEADER_NAMES, PAIRING_NAMES, type Announcement, type FooterVariant, type HeaderVariant, type Pairing, type Scheme, type ThemeSettings } from '@/domains/themes/types'
import { Choice, Field, LinkPicker, Switch, Text, type LinkTarget } from './controls'

// "Theme settings" (themes spec § Theme settings, every control). Typed choices only; the brand colour is the one
// free value, checked as it is picked against the style's light schemes.

export type StyleOption = { key: string; name: string; swatches: string[]; light: Scheme[] }

export function ThemeForm({ settings, style, styles, allowed, targets, fonts, set, setStyle }: {
  settings: ThemeSettings; style: string; styles: StyleOption[]
  allowed: { pairings: Pairing[]; headers: HeaderVariant[]; footers: FooterVariant[] }
  targets: LinkTarget[]; fonts: Record<Pairing, string>
  set: (s: Partial<ThemeSettings>) => void; setStyle: (k: string) => void
}) {
  const current = styles.find((s) => s.key === style) ?? styles[0]!
  const brandWhy = settings.brandColour ? brandColourProblem(settings.brandColour, current.light) : null
  const ann: Announcement = settings.announcement ?? { text: '', link: null, scheme: 'paper' }
  return (
    <div className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Style</legend>
        {styles.map((s) => (
          <label key={s.key} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 ${s.key === style ? 'border-2 border-foreground' : 'border border-input'}`}>
            <input type="radio" name="style" checked={s.key === style} onChange={() => setStyle(s.key)} className="sr-only" />
            <span className="flex gap-1">{s.swatches.map((c, i) => <span key={i} className="size-4 rounded-full border border-border" style={{ background: c }} />)}</span>
            <span className="text-sm">{s.name}</span>
          </label>
        ))}
      </fieldset>

      <div className="space-y-2">
        <Switch label="My own brand colour" on={!!settings.brandColour} onChange={(on) => set({ brandColour: on ? BRAND_COLOUR_START : null })} />
        {settings.brandColour && <Field label="Brand colour" hint={brandWhy ?? 'Used for links, badges and details. Buttons stay readable.'}>
          {(id) => <input id={id} type="color" value={settings.brandColour!} onChange={(e) => set({ brandColour: e.target.value.toUpperCase() as `#${string}` })} className="h-10 w-20 rounded-md border border-input" aria-invalid={!!brandWhy} />}
        </Field>}
        {brandWhy && <p role="alert" className="text-sm text-danger-text">{brandWhy}</p>}
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Type</legend>
        <div className="grid grid-cols-2 gap-2">
          {allowed.pairings.map((p) => (
            <button key={p} type="button" aria-pressed={settings.pairing === p} onClick={() => set({ pairing: p })} className={`min-h-14 rounded-md px-3 text-left ${settings.pairing === p ? 'border-2 border-foreground' : 'border border-input'}`}>
              <span className="block text-xl" style={{ fontFamily: fonts[p] }}>Aa</span><span className="text-xs text-muted-foreground">{PAIRING_NAMES[p]} + Inter</span>
            </button>
          ))}
        </div>
      </fieldset>
      <Choice label="Type size" value={settings.size} onChange={(size) => set({ size })} options={[{ value: 'compact', label: 'Compact' }, { value: 'regular', label: 'Regular' }, { value: 'large', label: 'Large' }]} />
      <Choice label="Headings" value={settings.headings} onChange={(headings) => set({ headings })} options={[{ value: 'as_typed', label: 'As typed' }, { value: 'upper', label: 'UPPERCASE' }]} />
      <Choice label="Corners" value={settings.corners} onChange={(corners) => set({ corners })} options={[{ value: 'square', label: 'Square' }, { value: 'soft', label: 'Soft' }, { value: 'round', label: 'Round' }]} />
      <Choice label="Buttons" value={settings.buttons} onChange={(buttons) => set({ buttons })} options={[{ value: 'solid', label: 'Solid' }, { value: 'outline', label: 'Outline' }]} />
      <Choice label="Spacing" value={settings.spacing} onChange={(spacing) => set({ spacing })} options={[{ value: 'airy', label: 'Airy' }, { value: 'regular', label: 'Regular' }, { value: 'compact', label: 'Compact' }]} />

      <h3 className="pt-2 text-sm font-semibold">Products</h3>
      <Choice label="Photo shape" value={settings.photo} onChange={(photo) => set({ photo, ...(photo === '4:5' ? { phoneColumns: 2 as const } : {}) })} options={[{ value: '4:5', label: '4:5' }, { value: '3:4', label: '3:4' }, { value: '1:1', label: '1:1' }]} />
      <Choice label="Columns on a phone" value={settings.phoneColumns} onChange={(phoneColumns) => set({ phoneColumns })} options={[{ value: 2, label: '2' }, ...(settings.photo === '4:5' ? [] : [{ value: 3 as const, label: '3' }])]} />
      <Switch label="Second photo on hover (computers)" on={settings.hoverPhoto} onChange={(hoverPhoto) => set({ hoverPhoto })} />

      <h3 className="pt-2 text-sm font-semibold">Header</h3>
      <Choice label="Layout" value={settings.header} onChange={(header) => set({ header })} options={allowed.headers.map((h) => ({ value: h, label: HEADER_NAMES[h] }))} />
      <Switch label="Stays at the top when scrolling" on={settings.sticky} onChange={(sticky) => set({ sticky })} />
      <Switch label="Tabs at the bottom on phones" on={settings.bottomTabs} onChange={(bottomTabs) => set({ bottomTabs })} />
      <div className="space-y-2">
        <Switch label="Announcement bar" on={!!settings.announcement} onChange={(on) => set({ announcement: on ? { text: 'Free shipping above ₹1,999', link: null, scheme: 'paper' } : null })} />
        {settings.announcement && <>
          <Text label="Announcement" value={ann.text} max={80} onChange={(text) => set({ announcement: { ...ann, text } })} />
          <LinkPicker label="Goes to" value={ann.link} targets={targets} onChange={(link) => set({ announcement: { ...ann, link } })} />
        </>}
      </div>
      <p className="text-sm text-muted-foreground">Logo: <Link href="/console/settings/brand" className="underline underline-offset-4">change it in Settings</Link>.</p>

      <h3 className="pt-2 text-sm font-semibold">Footer</h3>
      <Choice label="Layout" value={settings.footer} onChange={(footer) => set({ footer })} options={allowed.footers.map((f) => ({ value: f, label: FOOTER_NAMES[f] }))} />
      <Switch label="Instagram and WhatsApp links" on={settings.social} onChange={(social) => set({ social })} />
      <p className="text-xs text-muted-foreground">Policies, your legal name and the grievance officer always show: the law asks for them.</p>

      <Choice label="Motion" value={settings.motion} onChange={(motion) => set({ motion })} options={[{ value: 'subtle', label: 'Subtle' }, { value: 'none', label: 'None' }]} />
    </div>
  )
}
