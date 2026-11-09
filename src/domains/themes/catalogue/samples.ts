// The customizer's sample pieces as data (plan 2026-11-09-themes-three): their words, prices (paise) and swatch
// colours. Here because colours live in this folder (check:hex); src/lib/themes/sample.ts makes them shop pieces.
// Each `name` has drawn photos in public/themes/samples (scripts/themes/make-samples.mjs).
export type SamplePiece = { name: string; title: string; price: number; was?: number; soldOut?: boolean; type: 'top' | 'saree' | 'set' | 'bag' | 'shoe'; colour: string; hex: string; about: string; days: number }
export const SAMPLE_PIECES: SamplePiece[] = [
  { name: 'haldi-kurta', title: 'Haldi block-print kurta', price: 249000, type: 'top', colour: 'Haldi', hex: '#E9B23C', about: 'Hand-block printed cotton in a warm turmeric yellow. Straight cut, three-quarter sleeves, side slits.', days: 2 },
  { name: 'indigo-dabu', title: 'Indigo dabu kurta', price: 189000, was: 229000, type: 'top', colour: 'Indigo', hex: '#2F3E73', about: 'Mud-resist dabu print on soft cotton, dyed in indigo. Relaxed fit for long summer days.', days: 5 },
  { name: 'rani-anarkali', title: 'Rani pink anarkali', price: 385000, type: 'set', colour: 'Rani pink', hex: '#B8285E', about: 'A full-flared anarkali in rani pink with a gold border, made for the sangeet.', days: 8 },
  { name: 'ivory-chikan', title: 'Ivory chikankari kurta', price: 215000, type: 'top', colour: 'Ivory', hex: '#F4EEE2', about: 'Hand-embroidered chikankari on fine mulmul. Breathable, light and easy to style.', days: 11 },
  { name: 'mehndi-saree', title: 'Mehndi silk saree', price: 420000, type: 'saree', colour: 'Mehndi', hex: '#5E7A3A', about: 'Soft art silk in mehndi green with a zari border. Comes with an unstitched blouse piece.', days: 14 },
  { name: 'terracotta-coord', title: 'Terracotta stripe co-ord', price: 279000, type: 'set', colour: 'Terracotta', hex: '#B4573A', about: 'A boxy shirt and straight pants in striped handloom cotton.', days: 17 },
  { name: 'black-linen-shirt', title: 'Black linen shirt', price: 169000, soldOut: true, type: 'top', colour: 'Black', hex: '#222222', about: 'Pure linen, garment washed for a soft hand. A shirt for every day.', days: 20 },
  { name: 'sky-maxi', title: 'Sky polka maxi dress', price: 235000, type: 'set', colour: 'Sky', hex: '#8DB4D9', about: 'A breezy maxi in sky-blue polka cotton with a fitted bodice and a flared skirt.', days: 23 },
]

// Theme Signal plan S0-1: the sets a preview shows, by what the shop sells. Clothing is the set above; bags and
// accessories, and footwear, are drawn on the grey tile until real photos replace them (CREDITS.json).
export const ACCESSORY_PIECES: SamplePiece[] = [
  { name: 'navy-backpack', title: 'Roam backpack', price: 449000, was: 549000, type: 'bag', colour: 'Navy', hex: '#1F2A44', about: 'Water-shy canvas with a laptop sleeve lifted off the floor and a pocket for your pass.', days: 2 },
  { name: 'olive-backpack', title: 'Roam backpack', price: 449000, type: 'bag', colour: 'Olive', hex: '#5E6B37', about: 'The Roam in olive: a padded back, two bottle pockets and room for three days.', days: 4 },
  { name: 'tan-tote', title: 'Kora tote', price: 329000, type: 'bag', colour: 'Tan', hex: '#8A5530', about: 'Full-grain leather, a zip pocket inside and handles that sit on the shoulder.', days: 6 },
  { name: 'ink-tote', title: 'Easy tote', price: 259000, type: 'bag', colour: 'Ink', hex: '#2B2522', about: 'A deep canvas tote with a laptop pouch and a key clip.', days: 8 },
  { name: 'rust-sling', title: 'Day sling', price: 199000, type: 'bag', colour: 'Rust', hex: '#B24A2C', about: 'A small sling for a phone, a wallet and keys, worn across the body.', days: 10 },
  { name: 'black-sling', title: 'Day sling', price: 199000, soldOut: true, type: 'bag', colour: 'Black', hex: '#202020', about: 'The Day sling in black, with a quick-release buckle.', days: 12 },
  { name: 'brown-wallet', title: 'Bifold wallet', price: 129000, type: 'bag', colour: 'Brown', hex: '#5B3A22', about: 'Eight card slots, a note pocket and nothing more.', days: 14 },
  { name: 'cobalt-pouch', title: 'Tech pouch', price: 99000, type: 'bag', colour: 'Cobalt', hex: '#22336B', about: 'A zip pouch for chargers, cables and a power bank.', days: 16 },
]
export const FOOTWEAR_PIECES: SamplePiece[] = [
  { name: 'chalk-sneaker', title: 'Glide sneaker', price: 349000, type: 'shoe', colour: 'Chalk', hex: '#EDEAE2', about: 'A light canvas sneaker on a cushioned sole, made for a long day on your feet.', days: 2 },
  { name: 'black-sneaker', title: 'Glide sneaker', price: 349000, type: 'shoe', colour: 'Black', hex: '#222222', about: 'The Glide in black, with a washable insole.', days: 4 },
  { name: 'tan-loafer', title: 'Penny loafer', price: 459000, was: 529000, type: 'shoe', colour: 'Tan', hex: '#8C5A33', about: 'Soft leather loafers with a leather sole and a stitched apron.', days: 6 },
  { name: 'oxblood-loafer', title: 'Penny loafer', price: 459000, type: 'shoe', colour: 'Oxblood', hex: '#5E1F24', about: 'The penny loafer in oxblood, hand-burnished.', days: 8 },
  { name: 'sand-boot', title: 'Desert boot', price: 529000, type: 'shoe', colour: 'Sand', hex: '#B48A5E', about: 'Suede ankle boots on a crepe sole.', days: 10 },
  { name: 'olive-sneaker', title: 'Glide sneaker', price: 349000, soldOut: true, type: 'shoe', colour: 'Olive', hex: '#6B7A3D', about: 'The Glide in olive canvas.', days: 12 },
]

export type SampleSet = 'clothing' | 'accessories' | 'footwear'
/**
 * The set a preview shows for what the shop sells (shop_settings.sells): footwear only for a shop that sells footwear
 * and no clothing; accessories for one that sells accessories or jewellery and no clothing; clothing otherwise.
 */
export function sampleSetFor(sells: readonly string[]): SampleSet {
  const clothing = sells.some((k) => k === 'women' || k === 'men' || k === 'kids' || k === 'ethnic')
  if (clothing) return 'clothing'
  if (sells.includes('footwear') && !sells.some((k) => k === 'accessories' || k === 'jewellery')) return 'footwear'
  if (sells.some((k) => k === 'accessories' || k === 'jewellery' || k === 'footwear')) return 'accessories'
  return 'clothing'
}
export const SAMPLE_SETS: Record<SampleSet, SamplePiece[]> = { clothing: SAMPLE_PIECES, accessories: ACCESSORY_PIECES, footwear: FOOTWEAR_PIECES }
/** Each set's sample collections: handle, title, piece names. */
export const SAMPLE_COLLECTIONS: Record<SampleSet, [string, string, string[]][]> = {
  clothing: [
    ['kurtas', 'Kurtas', ['haldi-kurta', 'indigo-dabu', 'ivory-chikan']],
    ['occasion', 'Occasion', ['rani-anarkali', 'mehndi-saree']],
    ['everyday', 'Everyday', ['terracotta-coord', 'black-linen-shirt', 'sky-maxi']],
  ],
  accessories: [
    ['backpacks', 'Backpacks', ['navy-backpack', 'olive-backpack']],
    ['totes', 'Totes', ['tan-tote', 'ink-tote']],
    ['slings', 'Slings', ['rust-sling', 'black-sling']],
    ['wallets', 'Wallets', ['brown-wallet', 'cobalt-pouch']],
  ],
  footwear: [
    ['sneakers', 'Sneakers', ['chalk-sneaker', 'black-sneaker', 'olive-sneaker']],
    ['loafers', 'Loafers', ['tan-loafer', 'oxblood-loafer']],
    ['boots', 'Boots', ['sand-boot']],
  ],
}
