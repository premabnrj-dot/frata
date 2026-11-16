'use client'

import { Section } from '@/components/layout/section'
import { Facts } from '@/components/data/facts'
import { Badge, Tag } from '@/components/ui/badge'
import { Button, Spinner, button } from '@/components/ui/button'
import { FIELD } from '@/components/ui/field'
import { FieldError, fieldProps } from '@/components/ui/field-error'
import { InfoTip } from '@/components/ui/info-tip'
import { Segmented } from '@/components/ui/segmented'
import { BrandName, BrandTypeLine } from '@/components/shop-preview/brand-surfaces'
import { DEFAULT_PALETTE } from '@/domains/brand/defaults'
import { pairChecks } from '@/domains/brand/check'
import { COLOUR_ROLES, DENSITIES, DENSITY_NAMES, FONT_NAMES, FONTS, LOGO_NAMES, LOGO_SLOTS, RADII, ROLE_NAMES, type BrandRecord, type ColourRole, type Density, type Font, type LogoSlot, type Radius } from '@/domains/brand/record'
import { cn } from '@/lib/utils'

// =============================================================================
// Console › Brand's cards, as drawn (mockup docs/mockups/2026-11-16-p1-brand.html: Logo, Colours, Type, Shape). Each
// card is the editor's when `edit`; a Builder and a support visit read the same values as facts, never as disabled
// fields (§ Preview only). The words are the mockup's § Words.
// =============================================================================

export type SlotState = { uploading?: boolean; error?: string }
type Edit = { edit: boolean; errors: Record<string, string> }

const KIND = (url: string) => (/\.svg$/.test(url) ? 'SVG' : /\.jpg$/.test(url) ? 'JPEG' : 'WebP')

export function LogoCard({ b, edit, errors, shopName, slots, onPick, onRemove }: Edit & { b: BrandRecord; shopName: string; slots: Partial<Record<LogoSlot, SlotState>>
  onPick: (slot: LogoSlot, file: File) => void; onRemove: (slot: LogoSlot) => void }) {
  return (
    <Section title="Logo">
      {edit && <p className="-mt-2.5 text-label text-muted-foreground">SVG, PNG or WebP. PNG and WebP at least 120 px wide.</p>}
      <div className="grid grid-cols-2 gap-3">
        {LOGO_SLOTS.map((slot, n) => {
          const url = b.logos[slot], st = slots[slot] ?? {}, dark = slot === 'reversed'
          const id = `logo-${slot}`
          const pick = (label: string, variant: 'secondary' | 'ghost') => (
            <label className={cn(button({ variant, size: 'sm' }), variant === 'ghost' && 'px-1.5', 'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring', st.uploading && 'pointer-events-none')} aria-busy={st.uploading || undefined}>
              {st.uploading ? <><Spinner />Uploading…</> : label}
              <input type="file" accept="image/svg+xml,image/png,image/webp,.svg" className="sr-only" disabled={st.uploading}
                aria-label={label === 'Upload logo' ? label : `${label} ${LOGO_NAMES[slot]}`}
                {...(slot === 'main' && !st.error ? fieldProps('main', errors.main) : { 'aria-describedby': st.error ? `${id}-error` : undefined, 'aria-invalid': st.error ? true : undefined })}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(slot, f) }} />
            </label>
          )
          return (
            <div key={slot} className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border" data-logo={slot}>
              <div className={cn('grid h-26 place-items-center border-b border-border', !url && 'border-dashed bg-sunk')}
                style={url ? { background: dark ? b.palette.text : b.palette.bg, color: dark ? b.palette.bg : b.palette.text } : undefined}>
                {/* eslint-disable-next-line @next/next/no-img-element -- the store's own logo file, shown only through <img> (an SVG runs nothing there) */}
                {url ? <img src={url} alt={`${LOGO_NAMES[slot]}, ${shopName}`} className="max-h-20 max-w-[85%] object-contain" />
                  : n === 0 && <BrandName b={b} name={shopName} />}
              </div>
              <div className="flex min-h-11.5 flex-wrap items-center gap-x-2 gap-y-1 py-2 pr-1 pl-3">
                <b className="font-medium">{LOGO_NAMES[slot]}</b>
                {n > 0 && !url && <span className="text-muted-foreground">(optional)</span>}
                {url && <Tag>{KIND(url)}</Tag>}
                <span className="flex-1" />
                {edit && (url && !st.uploading ? <span className="flex">{pick('Replace', 'ghost')}<Button variant="ghost" size="sm" className="px-1.5" aria-label={`Remove ${LOGO_NAMES[slot]}`} onClick={() => onRemove(slot)}>Remove</Button></span>
                  : pick(n === 0 ? 'Upload logo' : 'Upload', 'secondary'))}
              </div>
              {st.error && <FieldError id={`${id}-error`} message={st.error} className="px-3 pb-2.5" />}
            </div>
          )
        })}
      </div>
      <FieldError name="main" message={errors.main} />
    </Section>
  )
}

export function ColoursCard({ b, edit, errors, onColour }: Edit & { b: BrandRecord; onColour: (role: ColourRole, v: string) => void }) {
  const checks = pairChecks(b.palette)
  return (
    <Section title="Colours">
      <div>
        {COLOUR_ROLES.map((role, i) => {
          const v = b.palette[role], id = `colour-${role}`, err = errors[role]
          const label = <>{ROLE_NAMES[role]}{role === 'panel' && <InfoTip about="Panel">Bands, the footer and the legal block.</InfoTip>}</>
          return (
            <div key={role} className={cn('grid grid-cols-[32px_minmax(0,1fr)_104px] items-center gap-x-3 gap-y-1 py-2.5 md:grid-cols-[32px_minmax(0,1fr)_116px]', i > 0 && 'border-t border-line-soft')} data-colour={role}>
              <span className="relative size-8 overflow-hidden rounded-md border border-border has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring" style={{ background: /^#[0-9A-Fa-f]{6}$/.test(v) ? v : undefined }}>
                {edit && <input type="color" value={(/^#[0-9A-Fa-f]{6}$/.test(v) ? v : DEFAULT_PALETTE.text).toLowerCase()} aria-label={`${ROLE_NAMES[role]} colour`} onChange={(e) => onColour(role, e.target.value.toUpperCase())}
                  className="absolute -inset-2 size-12 cursor-pointer opacity-0" />}
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                {edit ? <label htmlFor={id} className="text-sm font-medium">{label}</label> : <b className="text-sm font-medium">{label}</b>}
                <span className="flex flex-wrap gap-1" data-chips={role}>
                  {checks.filter((c) => c.role === role).map((c) => <Badge key={c.against} tone={c.ok ? 'ok' : 'danger'}><span className="font-num">{c.ratio.toFixed(2)}:1</span>&nbsp;on {ROLE_NAMES[c.against]}</Badge>)}
                </span>
              </div>
              {edit ? <input id={id} className={cn(FIELD, 'font-mono text-label')} value={v} maxLength={7} spellCheck={false} autoComplete="off" {...fieldProps(role, err)}
                onChange={(e) => onColour(role, e.target.value)} />
                : <span className="text-right font-mono text-label text-muted-foreground">{v}</span>}
              {err && <FieldError name={role} message={err} className="col-start-2 col-end-4" />}
            </div>
          )
        })}
      </div>
    </Section>
  )
}

export function TypeCard({ b, edit, errors, sample, onFont }: Edit & { b: BrandRecord; sample: { title: string; line: string }; onFont: (key: 'display' | 'body', f: Font) => void }) {
  const select = (key: 'display' | 'body', label: string) => (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={`font-${key}`} className="text-label font-medium">{label}</label>
      <select id={`font-${key}`} className={cn(FIELD, 'pr-7')} value={b[key]} {...fieldProps(key, errors[key])} onChange={(e) => onFont(key, e.target.value as Font)}>
        {[...FONTS].sort((x, y) => FONT_NAMES[x].localeCompare(FONT_NAMES[y])).map((f) => <option key={f} value={f}>{FONT_NAMES[f]}</option>)}
      </select>
      <FieldError name={key} message={errors[key]} />
    </div>
  )
  return (
    <Section title="Type">
      {edit ? <div className="grid gap-3 md:grid-cols-2">{select('display', 'Headings font')}{select('body', 'Body font')}</div>
        : <Facts className="grid-cols-[116px_minmax(0,1fr)] md:grid-cols-[180px_minmax(0,1fr)]" rows={[['Headings font', FONT_NAMES[b.display]], ['Body font', FONT_NAMES[b.body]]]} />}
      <BrandTypeLine b={b} title={sample.title} line={sample.line} />
    </Section>
  )
}

export function ShapeCard({ b, edit, errors, onRadius, onDensity }: Edit & { b: BrandRecord; onRadius: (r: Radius) => void; onDensity: (d: Density) => void }) {
  if (!edit) return <Section title="Shape"><Facts className="grid-cols-[116px_minmax(0,1fr)] md:grid-cols-[180px_minmax(0,1fr)]" rows={[['Corners', <span key="r" className="font-num">{b.radius} px</span>], ['Spacing', DENSITY_NAMES[b.density]]]} /></Section>
  return (
    <Section title="Shape">
      <div className="flex flex-col gap-1.5"><span className="text-label font-medium">Corners</span>
        <Segmented label="Corners" value={String(b.radius)} options={RADII.map((r) => [String(r), `${r} px`] as const)} onPick={(v) => onRadius(Number(v) as Radius)} invalid={fieldProps('radius', errors.radius)} className="self-start" />
        <FieldError name="radius" message={errors.radius} /></div>
      <div className="flex flex-col gap-1.5"><span className="text-label font-medium">Spacing</span>
        <Segmented label="Spacing" value={b.density} options={DENSITIES.map((d) => [d, DENSITY_NAMES[d]] as const)} onPick={onDensity} invalid={fieldProps('density', errors.density)} className="self-start" />
        <FieldError name="density" message={errors.density} /></div>
    </Section>
  )
}
