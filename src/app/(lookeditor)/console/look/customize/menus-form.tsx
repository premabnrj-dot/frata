'use client'

import { useMemo, useState } from 'react'
import { Icon } from '@/components/icons/icon'
import { ICON_NAMES, type IconName } from '@/domains/icons/names'
import { MENU_LIMITS, menuWarnings, type MenuItem, type Menus } from '@/domains/themes/site'
import { Field, LinkPicker, Segmented, type LinkTarget } from './controls'

// =============================================================================
// Menus (Look v4, mockup board "Menus"): Main, Footer and Phone tabs. A tree a thumb can work: each item moves up,
// down, in (under the one above) and out; 3 levels at most for Main, one for Footer and Tabs. Links only to the
// shop's own pages (the picker); an icon beside the words, never instead. Untouched, Main is the collections (as
// before menus); the first change makes it the merchant's own. Soft warnings past 7 top items or 10 under one.
// =============================================================================

type Which = keyof Menus
const NAMES: Record<Which, string> = { main: 'Main', footer: 'Footer', tabs: 'Phone tabs' }
const DEPTH: Record<Which, number> = { main: MENU_LIMITS.depth, footer: 1, tabs: 1 }
const MAX: Record<Which, number> = { main: MENU_LIMITS.items, footer: MENU_LIMITS.items, tabs: MENU_LIMITS.tabs }
/** Words a merchant might search an icon by, beyond its name. */
const ICON_WORDS: Partial<Record<IconName, string>> = { bag: 'cart shopping', cash: 'cod money rupee', card: 'pay upi', truck: 'delivery shipping', return: 'exchange', chat: 'help support message', pin: 'address location store', sparkle: 'new', flame: 'sale hot', dress: 'women kurta', shirt: 'men', camera: 'instagram', whatsapp: 'chat', grid: 'shop all categories', percent: 'offer discount sale', crown: 'premium bestseller' }

const TAB_STARTS: { label: string; link: string; icon: IconName }[] = [
  { label: 'Home', link: '/', icon: 'home' }, { label: 'Shop', link: '/products', icon: 'grid' }, { label: 'New', link: '/products', icon: 'sparkle' },
  { label: 'Help', link: '/policies/contact', icon: 'chat' }, { label: 'Returns', link: '/policies/returns', icon: 'return' },
]
const newId = () => `m-${Math.random().toString(36).slice(2, 10)}`
type Path = number[]
const at = (xs: MenuItem[], p: Path): MenuItem => p.slice(1).reduce((x, i) => x.children[i]!, xs[p[0]!]!)
/** The list a path's item sits in, and its index there. */
function edit(xs: MenuItem[], p: Path, f: (list: MenuItem[], i: number) => MenuItem[]): MenuItem[] {
  if (p.length === 1) return f(xs, p[0]!)
  const [h, ...rest] = p
  return xs.map((x, i) => (i === h ? { ...x, children: edit(x.children, rest, f) } : x))
}
const depthOf = (x: MenuItem): number => (x.children.length ? 1 + Math.max(...x.children.map(depthOf)) : 1)

export function MenusForm({ menus, own, set, targets, icons, rowLimit = null }: {
  /** The header's row shows this many top links on a computer (Split: 5); the rest are in its phone menu only. */
  rowLimit?: number | null
  /** What the shop shows now (menusOf: the merchant's, else the defaults). */
  menus: Menus
  /** What the merchant made (absent: the default). */
  own: Partial<Menus>
  set: (m: Partial<Menus>) => void
  targets: LinkTarget[]
  /** The shop's icons, drawn on the server in its library. */
  icons: Partial<Record<IconName, React.ReactNode>>
}) {
  const [which, setWhich] = useState<Which>('main')
  const [open, setOpen] = useState<string | null>(null)
  const items = menus[which] ?? []
  const put = (xs: MenuItem[] | null) => set({ ...own, [which]: xs })
  const warnings = which === 'main' ? [...menuWarnings(items), ...(rowLimit && items.length > rowLimit ? [`The Split header shows the first ${rowLimit} on a computer.`] : [])] : []
  const add = () => {
    if (items.length >= MAX[which]) return
    // A new tab starts as the next one a shop usually has (each needs an icon); a new link as a plain link.
    const next = TAB_STARTS.find((t) => !items.some((x) => x.label === t.label)) ?? TAB_STARTS[0]!
    const x: MenuItem = which === 'tabs' ? { id: newId(), ...next, children: [] } : { id: newId(), label: 'New link', link: '/', icon: null, children: [] }
    put([...items, x]); setOpen(x.id)
  }
  const move = (p: Path, d: -1 | 1) => put(edit(items, p, (l, i) => { const j = i + d; if (j < 0 || j >= l.length) return l; const n = [...l]; [n[i], n[j]] = [n[j]!, n[i]!]; return n }))
  const indent = (p: Path) => {
    const i = p.at(-1)!; if (i === 0) return
    const x = at(items, p), above = at(items, [...p.slice(0, -1), i - 1])
    if (p.length + depthOf(x) > DEPTH[which] || above.children.length >= MAX.main) return
    put(edit(edit(items, p, (l, k) => l.filter((_, j) => j !== k)), [...p.slice(0, -1), i - 1], (l, k) => l.map((y, j) => (j === k ? { ...y, children: [...y.children, x] } : y))))
  }
  const outdent = (p: Path) => {
    if (p.length < 2) return
    const x = at(items, p), parent = p.slice(0, -1)
    const without = edit(items, p, (l, k) => l.filter((_, j) => j !== k))
    put(edit(without, parent, (l, k) => [...l.slice(0, k + 1), x, ...l.slice(k + 1)]))
  }
  const remove = (p: Path) => put(edit(items, p, (l, k) => l.filter((_, j) => j !== k)))
  const change = (p: Path, x: Partial<MenuItem>) => put(edit(items, p, (l, k) => l.map((y, j) => (j === k ? { ...y, ...x } : y))))

  const row = (x: MenuItem, p: Path): React.ReactNode => {
    const canIn = p.at(-1)! > 0 && p.length + depthOf(x) <= DEPTH[which]
    const btn = 'grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30'
    return (
      <li key={x.id}>
        <div className="flex min-h-11 items-center gap-1 rounded-lg border border-border bg-card pl-2" style={{ marginLeft: (p.length - 1) * 16 }}>
          <button type="button" aria-expanded={open === x.id} onClick={() => setOpen(open === x.id ? null : x.id)} className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left text-sm">
            {x.icon && <span className="grid size-4 place-items-center [&_svg]:size-4" aria-hidden="true">{icons[x.icon]}</span>}
            <span className="truncate font-medium">{x.label}</span>
            <span className="truncate text-xs text-muted-foreground">{targets.find((t) => t.path === x.link)?.label ?? x.link}</span>
          </button>
          <button type="button" className={btn} aria-label={`Move ${x.label} up`} disabled={p.at(-1) === 0} onClick={() => move(p, -1)}>↑</button>
          <button type="button" className={btn} aria-label={`Move ${x.label} down`} onClick={() => move(p, 1)}>↓</button>
          {DEPTH[which] > 1 && <>
            <button type="button" className={btn} aria-label={`Put ${x.label} under the one above`} disabled={!canIn} onClick={() => indent(p)}>→</button>
            <button type="button" className={btn} aria-label={`Take ${x.label} out a level`} disabled={p.length < 2} onClick={() => outdent(p)}>←</button>
          </>}
        </div>
        {open === x.id && <ItemForm x={x} which={which} targets={targets} icons={icons} set={(y) => change(p, y)} onRemove={() => { remove(p); setOpen(null) }} indent={(p.length - 1) * 16} />}
        {x.children.length > 0 && <ul className="mt-1.5 space-y-1.5">{x.children.map((c, i) => row(c, [...p, i]))}</ul>}
      </li>
    )
  }

  return (
    <div className="space-y-4">
      <Segmented label="Menu" full value={which} onChange={(w) => { setWhich(w); setOpen(null) }} options={(Object.keys(NAMES) as Which[]).map((w) => ({ value: w, label: NAMES[w] }))} />
      {items.length > 0 ? <ul className="space-y-1.5">{items.map((x, i) => row(x, [i]))}</ul>
        : <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">{which === 'tabs' ? 'Home, Shop, Search, Bag' : 'No links yet'}</p>}
      {warnings.map((w) => <p key={w} role="status" className="rounded-md bg-warn px-3 py-2 text-sm text-warn-text">{w}</p>)}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={add} disabled={items.length >= MAX[which]} className="min-h-10 rounded-md border border-input px-3 text-sm font-medium disabled:opacity-40">Add a link</button>
        {own[which] && <button type="button" onClick={() => { const { [which]: _, ...rest } = own; set(rest); setOpen(null) }} className="text-sm underline underline-offset-4">{which === 'main' ? 'Use my collections' : which === 'tabs' ? 'Use Home, Shop, Search, Bag' : 'Remove the footer menu'}</button>}
        <span className="ml-auto text-xs text-muted-foreground">{items.length} / {MAX[which]}</span>
      </div>
    </div>
  )
}

function ItemForm({ x, which, targets, icons, set, onRemove, indent }: { x: MenuItem; which: Which; targets: LinkTarget[]; icons: Partial<Record<IconName, React.ReactNode>>; set: (x: Partial<MenuItem>) => void; onRemove: () => void; indent: number }) {
  const [label, setLabel] = useState(x.label)
  return (
    <div className="mt-1.5 space-y-4 rounded-lg border border-border bg-muted/40 p-3" style={{ marginLeft: indent }}>
      {/* Empty words are never saved: the field keeps them while typing, the menu keeps the last real ones. */}
      <Field label="Words" hint={`${label.length} / ${MENU_LIMITS.label}`}>
        {(id) => <input id={id} value={label} maxLength={MENU_LIMITS.label} onChange={(e) => { setLabel(e.target.value); if (e.target.value.trim()) set({ label: e.target.value.trim() }) }} onBlur={() => { if (!label.trim()) setLabel(x.label) }} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm" />}
      </Field>
      <LinkPicker label="Opens" value={x.link} targets={targets} optional={false} onChange={(v) => set({ link: v ?? '/' })} />
      <IconPicker value={x.icon} icons={icons} required={which === 'tabs'} onChange={(icon) => set({ icon })} />
      <button type="button" onClick={onRemove} className="min-h-9 text-sm text-danger-text underline underline-offset-4">Remove this link{x.children.length ? ' and the links under it' : ''}</button>
    </div>
  )
}

/** An icon from the shop's library: searchable by name and by what it is for. */
export function IconPicker({ value, icons, onChange, required = false }: { value: IconName | null; icons: Partial<Record<IconName, React.ReactNode>>; onChange: (v: IconName | null) => void; required?: boolean }) {
  const [q, setQ] = useState('')
  const shown = useMemo(() => { const s = q.trim().toLowerCase(); return ICON_NAMES.filter((n) => !s || n.includes(s) || (ICON_WORDS[n] ?? '').includes(s)) }, [q])
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium">Icon</legend>
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search icons" aria-label="Search icons" className="h-9 w-full rounded-md border border-input bg-card pl-8 pr-3 text-sm" />
      </div>
      <div role="radiogroup" aria-label="Icon" className="grid max-h-40 grid-cols-8 gap-1 overflow-y-auto">
        {!required && <button type="button" role="radio" aria-checked={value === null} aria-label="No icon" onClick={() => onChange(null)} className={`grid aspect-square place-items-center rounded-md text-xs text-muted-foreground ${value === null ? 'ring-2 ring-foreground' : 'hover:bg-muted'}`}>—</button>}
        {shown.map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={n} title={n} onClick={() => onChange(n)} className={`grid aspect-square place-items-center rounded-md [&_svg]:size-5 ${value === n ? 'bg-card ring-2 ring-foreground' : 'hover:bg-muted'}`}>{icons[n]}</button>
        ))}
      </div>
      {!shown.length && <p className="text-sm text-muted-foreground">No icon called “{q}”</p>}
    </fieldset>
  )
}
