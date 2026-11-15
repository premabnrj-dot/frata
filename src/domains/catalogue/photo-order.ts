// =============================================================================
// FILE: src/domains/catalogue/photo-order.ts — WHERE A PHOTO GOES (Neel N2: drag, Make cover, Move earlier/later).
// A step of one, or a place to drop it on; a place past the end lands last; a move to where it is changes nothing.
// =============================================================================

export type PhotoMove = -1 | 1 | { to: number }

/** The ids in their new order, or null when nothing moves. */
export function reorderPhotos<T>(ids: readonly T[], id: T, move: PhotoMove): T[] | null {
  const i = ids.indexOf(id)
  if (i < 0) return null
  const j = typeof move === 'object' ? Math.min(move.to, ids.length - 1) : i + move
  if (j < 0 || j >= ids.length || j === i) return null
  const out = [...ids]; const [x] = out.splice(i, 1); out.splice(j, 0, x!)
  return out
}
