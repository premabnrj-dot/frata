// =============================================================================
// FILE: src/domains/catalogue/category-id.ts
//
// What a taxonomy id says by its shape alone ("aa-1-23-7" sits under
// "aa-1-23"). Kept apart from taxonomy.ts so code that only compares ids does
// not pull the 250 KB category list into a browser bundle. Pure.
// =============================================================================

/** True when `id` is `ancestor` or sits under it (collections match "Kurtas and everything under it"). */
export const isWithin = (id: string, ancestor: string) => id === ancestor || id.startsWith(ancestor + '-')
