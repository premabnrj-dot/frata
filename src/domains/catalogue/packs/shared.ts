// Return lines several packs share (the returns page, policies/render.ts). A store gets each distinct line once, by rank.
import type { ReturnLine } from './types'

export const FASHION_RETURNS = { rank: 10, text: 'Clothes, footwear and accessories must be unused, unwashed and with their tags.' } as const satisfies ReturnLine
export const JEWELLERY_RETURNS = { rank: 20, text: 'Jewellery must be unworn, in its original packaging.' } as const satisfies ReturnLine
export const SEALED_RETURNS = { rank: 30, text: 'Beauty, personal care and wellness products can be returned only unopened, with their seal intact: once opened they can’t be taken back, for hygiene.' } as const satisfies ReturnLine
