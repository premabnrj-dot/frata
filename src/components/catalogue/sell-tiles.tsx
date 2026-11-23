'use client'

import type { Tile } from '@/domains/catalogue/packs'

/**
 * "What do you sell?": one tile per category pack, any number pressed (sign-up's last question, O1·8 as drawn). The
 * tiles come from the server (`SELL_TILES`), so no pack data enters a client chunk (C1a·6). Each icon is a line drawing:
 * decorative, the words say what it is.
 */
export function SellTiles({ tiles, value, onChange }: { tiles: readonly Tile[]; value: readonly string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="su-tiles" role="group" aria-label="What you sell">
      {tiles.map((t) => {
        const on = value.includes(t.key)
        return (
          <button key={t.key} type="button" aria-pressed={on} className="su-tile"
            onClick={() => onChange(on ? value.filter((x) => x !== t.key) : [...value, t.key])}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={t.icon} /></svg>{t.label}
          </button>
        )
      })}
    </div>
  )
}
