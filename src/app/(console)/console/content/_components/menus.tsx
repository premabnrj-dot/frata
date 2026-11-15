'use client'

import { MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Section } from '@/components/layout/section'
import { Badge, Tag } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FIELD } from '@/components/ui/field'
import { Icon } from '@/components/icons/icon'
import { Menu } from '@/components/ui/menu'
import { useToast } from '@/components/ui/toast'
import { ICON_NAMES } from '@/domains/icons/names'
import { MENU_KEYS, MENU_NAMES, type MenuKey } from '@/domains/content/kinds'
import { MENU_LIMITS, type MenuItem } from '@/domains/themes/site'
import { saveMenuAction, undoContentAction } from '../actions'
import { LinkSelect, type Target } from './link-select'

// =============================================================================
// Content › Menus (final mockup § Menus): Main (3 levels), Footer (1), Phone tabs (≤ 5, each with an icon; shown when
// the look has bottom tabs). Moved by Up, Down, Move under <the one above>, Move out of <its parent>; one Save per menu
// (shoppers see it at once), with Discard; a save is a toast with Undo.
// =============================================================================

type One = { id: string | null; version: number | null; items: MenuItem[] }
type Path = number[]
const at = (xs: MenuItem[], p: Path): MenuItem => p.slice(1).reduce((x, i) => x.children[i]!, xs[p[0]!]!)
const siblings = (xs: MenuItem[], p: Path): MenuItem[] => (p.length === 1 ? xs : at(xs, p.slice(0, -1)).children)
/** A copy of the tree with the list at `parent` (null: the top) replaced. */
function withList(xs: MenuItem[], parent: Path | null, list: MenuItem[]): MenuItem[] {
  if (!parent) return list
  const [h, ...rest] = parent
  return xs.map((x, i) => (i === h ? { ...x, children: rest.length ? withList(x.children, rest, list) : list } : x))
}
const parentOf = (p: Path) => (p.length === 1 ? null : p.slice(0, -1))
const depthOf = (x: MenuItem): number => 1 + Math.max(0, ...x.children.map(depthOf))
const newId = (label: string) => `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'link'}-${Math.random().toString(36).slice(2, 7)}` // clock-ok: an id, not a time

function move(xs: MenuItem[], p: Path, how: 'up' | 'down' | 'in' | 'out' | 'remove'): MenuItem[] {
  const list = siblings(xs, p), i = p[p.length - 1]!, parent = parentOf(p)
  if (how === 'remove') return withList(xs, parent, list.filter((_, j) => j !== i))
  if (how === 'up' || how === 'down') {
    const j = how === 'up' ? i - 1 : i + 1
    if (j < 0 || j >= list.length) return xs
    const out = [...list]; [out[i], out[j]] = [out[j]!, out[i]!]
    return withList(xs, parent, out)
  }
  if (how === 'in') {
    if (i === 0) return xs
    const above = list[i - 1]!, me = list[i]!
    const out = list.filter((_, j) => j !== i).map((x, j) => (j === i - 1 ? { ...above, children: [...above.children, me] } : x))
    return withList(xs, parent, out)
  }
  if (!parent) return xs
  const me = list[i]!, pi = parent[parent.length - 1]!
  const inner = withList(xs, parent, list.filter((_, j) => j !== i))
  const outer = siblings(inner, parent)
  return withList(inner, parentOf(parent), [...outer.slice(0, pi + 1), me, ...outer.slice(pi + 1)])
}

export function Menus({ menus, canSave, lock, targets, tabsOn, splitHeader }: { menus: Record<MenuKey, One>; canSave: boolean; lock: string | null; targets: Target[]; tabsOn: boolean; splitHeader: boolean }) {
  return (
    <div className="space-y-4">
      {MENU_KEYS.map((k) => (k === 'tabs' && !tabsOn
        ? <Section key={k} ariaLabel={MENU_NAMES.tabs} title={MENU_NAMES.tabs} action={<span className="flex items-center gap-2"><Badge>Off in Look</Badge><a href="/console/look" className="inline-flex min-h-6 items-center text-sm font-medium text-link">Turn on in Look</a></span>} />
        : <OneMenu key={`${k}:${menus[k].version ?? 0}`} which={k} one={menus[k]} canSave={canSave} lock={lock} targets={targets} rowLimit={k === 'main' && splitHeader ? 5 : null} />))}
    </div>
  )
}

function OneMenu({ which, one, canSave, lock, targets, rowLimit }: { which: MenuKey; one: One; canSave: boolean; lock: string | null; targets: Target[]; rowLimit: number | null }) {
  const router = useRouter()
  const toast = useToast()
  const [items, setItems] = useState(one.items)
  const [edit, setEdit] = useState<{ path: Path | null; label: string; link: string | null; icon: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const changed = JSON.stringify(items) !== JSON.stringify(one.items)
  const max = which === 'tabs' ? MENU_LIMITS.tabs : MENU_LIMITS.items
  const name = MENU_NAMES[which]
  const linkName = (l: string) => targets.find((x) => x.path === l)?.label.replace(/^\w+ · /, '') ?? l

  const save = async () => {
    setBusy(true)
    const r = await saveMenuAction({ key: which, version: one.version, items })
    setBusy(false)
    if (!r.ok) { toast.error(r.error); return }
    toast({ text: `${name} saved`, undo: one.version ? async () => { const u = await undoContentAction({ id: r.id, version: r.version }); router.refresh(); return u } : undefined })
    router.refresh()
  }
  const put = () => {
    if (!edit) return
    if (!edit.label.trim()) { setError('Write the words shoppers tap.'); return }
    if (!edit.link) { setError('Pick the page it opens.'); return }
    if (which === 'tabs' && !edit.icon) { setError('Pick an icon for this tab.'); return }
    const item = { label: edit.label.trim(), link: edit.link, icon: (edit.icon as MenuItem['icon']) ?? null }
    if (edit.path) { const p = edit.path; const list = siblings(items, p); setItems(withList(items, parentOf(p), list.map((x, j) => (j === p[p.length - 1] ? { ...x, ...item } : x)))) }
    else setItems([...items, { id: newId(item.label), children: [], ...item }])
    setEdit(null); setError(null)
  }
  const row = (x: MenuItem, p: Path) => {
    const list = siblings(items, p), i = p[p.length - 1]!, above = list[i - 1], parent = parentOf(p) ? at(items, parentOf(p)!) : null
    const canIn = which === 'main' && !!above && p.length + depthOf(x) <= MENU_LIMITS.depth
    return (
      <li key={x.id}>
        <div className="flex items-center gap-2 py-2.5" style={{ paddingLeft: `${(p.length - 1) * 22}px` }}>
          <div className="min-w-0 flex-1"><p className="truncate font-medium">{x.label}</p>
            <p className="truncate text-label text-muted-foreground">{which === 'tabs' ? `Icon · ${x.icon ?? 'none'}` : `→ ${linkName(x.link)}${x.children.length ? ` · ${x.children.length} links under it` : ''}`}</p></div>
          {canSave && <span className="flex items-center gap-1">
            <Button size="sm" variant="ghost" aria-label={`Move ${x.label} up`} disabled={i === 0} onClick={() => setItems(move(items, p, 'up'))}><Icon name="up" className="size-4" /></Button>
            <Button size="sm" variant="ghost" aria-label={`Move ${x.label} down`} disabled={i === list.length - 1} onClick={() => setItems(move(items, p, 'down'))}><Icon name="down" className="size-4" /></Button>
            <Menu label={`More for ${x.label}`} size="sm" icon={<MoreHorizontal aria-hidden="true" className="size-4" />} items={[
              { label: 'Edit', onSelect: () => setEdit({ path: p, label: x.label, link: x.link, icon: x.icon }) },
              ...(canIn ? [{ label: `Move under ${above!.label}`, onSelect: () => setItems(move(items, p, 'in')) }] : []),
              ...(parent ? [{ label: `Move out of ${parent.label}`, onSelect: () => setItems(move(items, p, 'out')) }] : []),
              { label: 'Remove', danger: true, onSelect: () => setItems(move(items, p, 'remove')) },
            ]} />
          </span>}
        </div>
        {x.children.length > 0 && <ul>{x.children.map((c, j) => row(c, [...p, j]))}</ul>}
      </li>
    )
  }
  return (
    <Section ariaLabel={name} title={<span className="flex items-center gap-2">{name} <Tag className="font-num">{items.length} of {max}</Tag></span>}
      action={canSave ? <Button size="sm" variant="secondary" disabled={items.length >= max} onClick={() => setEdit({ path: null, label: '', link: null, icon: null })}>{which === 'tabs' ? 'Add a tab' : 'Add a link'}</Button> : lock ? <Badge>{lock}</Badge> : null}>
      {items.length ? <ul data-list className="divide-y divide-line-soft">{items.map((x, i) => row(x, [i]))}</ul> : <p className="py-4 text-center text-muted-foreground">{which === 'tabs' ? 'No tabs yet' : 'No links yet'}</p>}
      {rowLimit && items.length > rowLimit && <p className="mt-2 text-label text-muted-foreground">The Split header shows the first {rowLimit} on a computer.</p>}
      {changed && canSave && (
        <div role="region" aria-label="Unsaved changes" className="mt-3 flex flex-wrap items-center gap-2 rounded-mid bg-bar px-3 py-2 text-sm text-bar-foreground shadow-lg">
          <span>Unsaved changes</span><span className="flex-1" />
          <Button size="sm" variant="ghost" className="text-bar-foreground" onClick={() => setItems(one.items)}>Discard change</Button>
          <Button size="sm" busy={busy} onClick={save}>Save {name.toLowerCase()}</Button>
        </div>
      )}
      <Dialog open={!!edit} onClose={() => { setEdit(null); setError(null) }} title={edit?.path ? `Edit ${edit.label}` : which === 'tabs' ? 'Add a tab' : 'Add a link'} error={error}
        actions={<><Button variant="secondary" data-autofocus onClick={() => { setEdit(null); setError(null) }}>{edit?.path ? 'Keep as it is' : 'Don’t add'}</Button><Button onClick={put}>{edit?.path ? 'Done' : which === 'tabs' ? 'Add tab' : 'Add link'}</Button></>}>
        {edit && <div className="grid gap-4">
          <label className="grid gap-1.5"><span className="flex justify-between text-label font-medium">Label<span className="font-num font-normal text-muted-foreground">{edit.label.length}/{MENU_LIMITS.label}</span></span>
            <input value={edit.label} maxLength={MENU_LIMITS.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} className={`${FIELD} w-full`} /></label>
          <LinkSelect label="Opens" value={edit.link} targets={targets} none="Pick a page" onChange={(link) => setEdit({ ...edit, link })} />
          {/* Look v4 menus carry an icon beside the words: a tab needs one, a link may have one (plan § Deviations). */}
          <label className="grid gap-1.5"><span className="text-label font-medium">Icon</span>
            <select value={edit.icon ?? ''} onChange={(e) => setEdit({ ...edit, icon: e.target.value || null })} className={`${FIELD} w-full`}><option value="">{which === 'tabs' ? 'Pick an icon' : 'No icon'}</option>{ICON_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        </div>}
      </Dialog>
    </Section>
  )
}
