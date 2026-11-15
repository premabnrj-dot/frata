'use client'

import { useRef } from 'react'
import { announce } from '@/components/shell/announce'

// =============================================================================
// FILE: src/components/ui/sortable.ts — MOVING ITEMS IN A ROW (Neel N2: photos, sizes, colours).
// Pointer events (they work for a finger as for a mouse; HTML5 drag-and-drop does not on touch) and Alt+← / Alt+→ on a
// focused item (plain arrows belong to the fields beside it). Each move is said once ("M moved to 2 of 6") and focus stays
// on the moved item. Nothing animates (lists never do: § Motion). The caller keeps the order; this only says where to.
// =============================================================================

export const MOVE_KEYS = 'Alt+ArrowLeft Alt+ArrowRight'

/** Props for each item: `itemProps(i, name)` spreads onto the handle (or the item). `onMove(from, to)` changes the order. */
export function useReorder(count: number, onMove: (from: number, to: number) => void) {
  const drag = useRef<{ from: number; pointer: number; startX: number; startY: number; moved: boolean } | null>(null)
  const say = (name: string, to: number) => announce(`${name} moved to ${to + 1} of ${count}`)
  const move = (from: number, to: number, name: string, el?: HTMLElement | null) => {
    if (to < 0 || to >= count || to === from) return
    onMove(from, to); say(name, to)
    // Focus follows the item to its new place, after React has drawn it there.
    const list = el?.closest('[data-sortable]')
    if (list) requestAnimationFrame(() => list.querySelectorAll<HTMLElement>('[data-sort-item]')[to]?.focus())
  }
  const itemProps = (i: number, name: string) => ({
    'data-sort-item': '',
    'aria-keyshortcuts': MOVE_KEYS,
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
      e.preventDefault(); move(i, i + (e.key === 'ArrowRight' ? 1 : -1), name, e.currentTarget)
    },
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return
      drag.current = { from: i, pointer: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false }
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const d = drag.current
      if (!d || d.pointer !== e.pointerId) return
      if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 6) return
      if (!d.moved) { d.moved = true; e.currentTarget.setPointerCapture(e.pointerId) }
      e.preventDefault()
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      const d = drag.current; drag.current = null
      if (!d?.moved) return
      const list = e.currentTarget.closest('[data-sortable]')
      const items = [...(list?.querySelectorAll<HTMLElement>('[data-sort-item]') ?? [])]
      // The drop lands on the item under the pointer (its middle decides before or after).
      let to = d.from
      items.forEach((el, j) => { const r = el.getBoundingClientRect(); if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) to = j })
      move(d.from, to, name, e.currentTarget)
    },
    onPointerCancel: () => { drag.current = null },
  })
  return { itemProps, move }
}

/** The order after moving one item (the caller's state). */
export const moved = <T,>(xs: readonly T[], from: number, to: number): T[] => {
  const out = [...xs]; const [x] = out.splice(from, 1); out.splice(to, 0, x!); return out
}
