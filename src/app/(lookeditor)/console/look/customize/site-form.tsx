'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { IconName } from '@/domains/icons/names'
import { clampSize, ICON_LIBRARIES, ICON_STROKES, PALETTE_NAMES, PALETTE_ROLES, paletteProblem, TEXT_NAMES, TEXT_RANGE, TEXT_STYLES, textOf, type IconLibrary, type Palette, type SiteSettings, type TextStyle, type TextStyleKey } from '@/domains/themes/site'
import { onColour } from '@/domains/themes/layer'
import type { Hex, Scheme } from '@/domains/themes/types'
import { Field, Group, Segmented, Switch } from './controls'

// =============================================================================
// Site settings (Look v4, mockup board "Site settings"): the shop's design system behind the gear. A palette of six
// roles (contrast checked as it is picked: an unreadable palette is never saved), eight text styles (a computer and
// a phone size each), the icon library and its stroke, and where the brand lives (Settings › Brand). Absent = the
// theme's own; every part has "Use the theme's".
// =============================================================================

export type IconPreviews = Record<IconLibrary, Partial<Record<IconName, React.ReactNode>>>
const LIB_NAMES: Record<IconLibrary, string> = { line: 'Line', duotone: 'Duotone', solid: 'Solid' }
const STROKE_NAMES = { thin: 'Thin', regular: 'Regular', bold: 'Bold' } as const
const SHOWN: IconName[] = ['bag', 'search', 'heart', 'truck', 'user']
const ic = (d: string) => <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current stroke-[1.75]"><path d={d} /></svg>
const ICONS = {
  colour: ic('M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.6 0-1.2-1-1.4-1-2.4 0-.8.6-1.5 1.6-1.5H16a5 5 0 0 0 5-5c0-4-4-7.5-9-7.5z'),
  type: ic('M5 7V5h14v2M9 19h6M12 5v14'), icons: ic('M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'), brand: ic('M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z'),
}

export function SiteForm({ site, set, presets, icons, theme }: {
  site: SiteSettings
  /** The style's light schemes (paper, tint): what the palette keeps from it must read too. */
  theme: Scheme[]
  set: (s: SiteSettings) => void
  /** The theme's own styles as palettes (where a merchant's palette starts). */
  presets: { name: string; palette: Palette }[]
  icons: IconPreviews
}) {
  return (
    <div>
      <Colours site={site} set={set} presets={presets} theme={theme} />
      <Group title="Text styles" icon={ICONS.type} value={Object.keys(site.text).length ? `${Object.keys(site.text).length} set` : 'The theme’s'}>
        <div className="divide-y divide-border rounded-xl border border-border">
          {TEXT_STYLES.map((k) => <TextRow key={k} k={k} site={site} set={set} />)}
        </div>
      </Group>
      <Group title="Icons" icon={ICONS.icons} value={`${LIB_NAMES[site.icons.library]} · ${STROKE_NAMES[site.icons.stroke]}`}>
        <div role="radiogroup" aria-label="Icon style" className="grid gap-2">
          {ICON_LIBRARIES.map((l) => (
            <button key={l} type="button" role="radio" aria-checked={site.icons.library === l} onClick={() => set({ ...site, icons: { ...site.icons, library: l } })}
              className={`flex min-h-12 items-center gap-3 rounded-xl border px-3 text-left text-sm transition-[border-color] duration-fast ${site.icons.library === l ? 'border-foreground shadow-[inset_0_0_0_1px_var(--color-foreground)]' : 'border-border hover:border-input'}`}>
              <span className="w-16 font-medium">{LIB_NAMES[l]}</span>
              <span className="flex gap-2.5 text-foreground" aria-hidden="true">{SHOWN.map((n) => <span key={n} className="grid size-5 place-items-center [&_svg]:size-5">{icons[l][n]}</span>)}</span>
            </button>
          ))}
        </div>
        {site.icons.library === 'line' && <div className="space-y-1.5"><p className="text-sm font-medium">Stroke</p>
          <Segmented label="Stroke" full value={site.icons.stroke} onChange={(stroke) => set({ ...site, icons: { ...site.icons, stroke } })} options={ICON_STROKES.map((s) => ({ value: s, label: STROKE_NAMES[s] }))} /></div>}
      </Group>
      <Group title="Brand" icon={ICONS.brand}>
        <Link href="/console/settings" className="flex min-h-10 items-center justify-between rounded-md border border-input px-3 text-sm">Logo and shop name<span aria-hidden="true">›</span></Link>
      </Group>
    </div>
  )
}

function Colours({ site, set, presets, theme }: { site: SiteSettings; set: (s: SiteSettings) => void; presets: { name: string; palette: Palette }[]; theme: Scheme[] }) {
  // The palette being picked: a colour that doesn't read stays here (with why) and is never saved.
  const [draft, setDraft] = useState<Palette | null>(site.palette)
  const shown = draft ?? site.palette
  const why = shown ? paletteProblem(shown, theme) : null
  const pick = (p: Palette | null) => { setDraft(p); if (!p || !paletteProblem(p, theme)) set({ ...site, palette: p }) }
  return (
    <Group title="Colours" icon={ICONS.colour} value={site.palette ? 'Your palette' : 'The theme’s'} open>
      {presets.length > 0 && <Switch label="My own palette" on={!!shown} onChange={(on) => pick(on ? presets[0]!.palette : null)} />}
      {shown && <>
        <div role="radiogroup" aria-label="Start from" className="flex flex-wrap gap-2">
          {presets.map((p) => {
            const on = PALETTE_ROLES.every((r) => p.palette[r] === shown[r])
            return (
              <button key={p.name} type="button" role="radio" aria-checked={on} onClick={() => pick(p.palette)} className={`flex items-center gap-2 rounded-full border px-2 py-1 text-xs ${on ? 'border-foreground' : 'border-border'}`}>
                <span className="flex h-4 w-10 overflow-hidden rounded-full" aria-hidden="true">{(['background', 'primary', 'accent'] as const).map((r) => <span key={r} className="flex-1" style={{ background: p.palette[r] }} />)}</span>{p.name}
              </button>
            )
          })}
        </div>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {PALETTE_ROLES.map((r) => (
            <li key={r}>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-1.5">
                <input type="color" value={shown[r]} onChange={(e) => pick({ ...shown, [r]: e.target.value.toUpperCase() as Hex })} aria-label={PALETTE_NAMES[r].name} className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-input" />
                <span className="min-w-0"><span className="block text-sm font-medium">{PALETTE_NAMES[r].name}</span><span className="block truncate text-xs text-muted-foreground">{PALETTE_NAMES[r].use}</span></span>
                <span className="ml-auto font-mono text-xs text-muted-foreground">{shown[r]}</span>
              </label>
            </li>
          ))}
        </ul>
        {/* Contrast checked as it is picked (Look v4: "Reads well"). */}
        <div className="flex items-center gap-3 rounded-xl p-3 text-sm" style={{ background: shown.background, color: shown.text }}>
          <span className="font-medium">Aa</span><span style={{ color: shown.muted }}>Second words</span>
          <span className="ml-auto rounded-md px-2.5 py-1 text-xs font-medium" style={{ background: shown.primary, color: onColour(shown.primary) }}>Button</span>
        </div>
        {why ? <p role="alert" className="text-sm text-danger-text">{why}</p> : <p role="status" className="text-sm text-ok-text">Reads well</p>}
      </>}
    </Group>
  )
}

function TextRow({ k, site, set }: { k: TextStyleKey; site: SiteSettings; set: (s: SiteSettings) => void }) {
  const [open, setOpen] = useState(false)
  const t = textOf(site, k)
  const own = !!site.text[k]
  const put = (x: Partial<TextStyle>) => set({ ...site, text: { ...site.text, [k]: { ...(site.text[k] ?? {}), ...x } } })
  const reset = () => { const { [k]: _, ...rest } = site.text; set({ ...site, text: rest }) }
  const [lo, hi] = TEXT_RANGE[k]
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex min-h-11 w-full items-center gap-3 px-3 text-left">
        <span className="w-24 text-sm font-medium">{TEXT_NAMES[k]}</span>
        <span className="truncate text-xs text-muted-foreground">{t.family === 'heading' ? 'Heading' : 'Body'} · {t.desk}/{t.phone} px · {t.weight}{own ? '' : ' · theme'}</span>
      </button>
      {open && (
        <div className="space-y-4 px-3 pb-4">
          <Segmented label={`${TEXT_NAMES[k]} font`} full value={t.family} onChange={(family) => put({ family })} options={[{ value: 'heading', label: 'Heading' }, { value: 'body', label: 'Body' }]} />
          {(['desk', 'phone'] as const).map((d) => (
            <Field key={d} label={`${d === 'desk' ? 'Computer' : 'Phone'} · ${t[d]} px`}>
              {(id) => <input id={id} type="range" min={lo} max={hi} step={1} value={t[d]} onChange={(e) => put({ [d]: clampSize(k, Number(e.target.value)) })} className="w-full accent-[var(--color-foreground)]" />}
            </Field>
          ))}
          <Segmented label={`${TEXT_NAMES[k]} weight`} full value={t.weight} onChange={(weight) => put({ weight })} options={([400, 500, 600, 700] as const).map((w) => ({ value: w, label: String(w) }))} />
          <Switch label="Capitals" on={t.upper} onChange={(upper) => put({ upper })} />
          <Switch label="Spaced letters" on={t.wide} onChange={(wide) => put({ wide })} />
          {own && <button type="button" onClick={reset} className="text-sm underline underline-offset-4">Use the theme’s</button>}
        </div>
      )}
    </div>
  )
}
