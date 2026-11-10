import { TILE_EK } from './mark-paths'

/** EkCode's icon as a data URI (browser tab, home screen): an image, where CSS tokens cannot reach (check:hex lists it). */
export const EK_ICON = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1C1917"/><path d="${TILE_EK}" fill="#FAFAF9"/><rect x="22" y="48" width="20" height="3.2" rx="1.6" fill="#FF5C97"/></svg>`)}`
