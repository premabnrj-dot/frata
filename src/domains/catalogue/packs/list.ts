import { pure } from './define'
import { accessories } from './accessories'
import { beauty } from './beauty'
import { ethnic } from './ethnic'
import { footwear } from './footwear'
import { jewellery } from './jewellery'
import { kids } from './kids'
import { men } from './men'
import { wellness } from './wellness'
import { women } from './women'

/** Every category pack. Append only: this order is the shop_settings_sells CHECK's order (schema.ts, check:packs). */
export const PACKS = /*#__PURE__*/ pure(() => [women, men, kids, ethnic, accessories, footwear, jewellery, beauty, wellness] as const)
