// A GSTIN as typed, made comparable: upper case, no spaces. Its own file so the shopper's checkout loads this line
// without the GST state-code table that gstin.ts carries (2026-11-11: that table tipped checkout past its 121 kB budget).
export const cleanGstin = (raw: string) => raw.toUpperCase().replace(/\s/g, '')
