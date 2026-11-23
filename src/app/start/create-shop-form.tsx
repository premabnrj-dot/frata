'use client'

import { SELL_LABELS, type SellKey } from '@/domains/catalogue/sell-keys'

/** "What do you sell?": one tile per key, any number pressed (sign-up's last question, O1·8 as drawn). */
export function SellTiles({ sells, onChange }: { sells: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="su-tiles" role="group" aria-label="What you sell">
      {SELL_LABELS.map(([k, label]) => {
        const on = sells.includes(k)
        return (
          <button key={k} type="button" aria-pressed={on} className="su-tile"
            onClick={() => onChange(on ? sells.filter((x) => x !== k) : [...sells, k])}>
            <SellIcon k={k} />{label}
          </button>
        )
      })}
    </div>
  )
}

/** A line drawing per category (decorative; the words say what it is). */
function SellIcon({ k }: { k: SellKey }) {
  const d: Record<SellKey, string> = {
    women: 'M9 3h6l1 5-2 1 2 12H8l2-12-2-1z', men: 'M8 3l4 2 4-2 4 4-3 3v11H7V10L4 7z', kids: 'M12 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 9h8l-1 6h-6zM9 15l-1 6M15 15l1 6',
    ethnic: 'M12 3l3 4-1 3 3 11H7l3-11-1-3z', footwear: 'M3 16c4 0 6-2 8-6l3 3c2 2 4 3 7 3v3H3z', accessories: 'M5 9h14l-1.5 11h-11zM9 9a3 3 0 0 1 6 0',
    jewellery: 'M6 4h12l3 5-9 11L3 9zM3 9h18', beauty: 'M9 3h6v4l2 3v10H7V10l2-3z', wellness: 'M12 21c-5-3-8-7-8-11a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 4-3 8-8 11z',
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d[k]} /></svg>
}
