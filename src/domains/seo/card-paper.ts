// The share card's fixed colours (search and sharing S1·4): a card is an image drawn by next/og, outside the CSS
// tokens, so its band and gaps are data here (check:hex allows this file, as it does the PDF paper palette).
export const CARD_PAPER = {
  /** The dark band under a product photo, and the collection's caption: white text on it is AA at any photo. */
  band: 'rgba(28,25,23,0.86)',
  onBand: '#ffffff',
  chipLine: 'rgba(255,255,255,0.65)',
  /** The gaps between a collection's photos, and the backing a transparent PNG is flattened onto. */
  gap: '#ffffff',
} as const
