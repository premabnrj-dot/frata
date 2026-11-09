// =============================================================================
// FILE: src/domains/ekcode/notice.ts — WHAT A SHOPPER AGREES TO, and what a shop receives (spec § 5; owner: English
// only until other languages are planned). The text and its version live here once; the consent row stores the
// version (`ekcode-network@1`) so what was agreed can always be shown again. Draft for counsel (plan task 11). Pure.
// =============================================================================

export const NOTICE_VERSION = 'ekcode-network@1'

/** The three lines of the network notice, as shown on the Create screen. */
export const NOTICE_LINES = [
  'EkCode keeps your name, phone and delivery addresses.',
  'A shop gets them only when you tap Continue there.',
  'Remove a shop or delete EkCode any time at ekcode.in.',
] as const

export const AGE_LINE = 'For 18 and over.'

export const GRIEVANCE = { name: 'Priti Bag', email: 'privacy@ekcode.in' } as const

/** What a shop may receive: always name and phone; an address only when the shopper picks one. */
export type ShareItem = 'name' | 'phone' | 'address'

export function shareItems(addressChosen: boolean): ShareItem[] {
  return addressChosen ? ['name', 'phone', 'address'] : ['name', 'phone']
}

/** The share consent's version is per shop (the shopper agreed to share with that shop on that day). */
export const SHARE_VERSION = 'ekcode-share@1'
