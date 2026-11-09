// The customizer's sample pieces as data (plan 2026-11-09-themes-three): their words, prices (paise) and swatch
// colours. Here because colours live in this folder (check:hex); src/lib/themes/sample.ts makes them shop pieces.
// Each `name` has drawn photos in public/themes/samples (scripts/themes/make-samples.mjs).
export type SamplePiece = { name: string; title: string; price: number; was?: number; soldOut?: boolean; type: 'top' | 'saree' | 'set'; colour: string; hex: string; about: string; days: number }
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
