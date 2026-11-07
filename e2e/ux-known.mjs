// =============================================================================
// FILE: e2e/ux-known.mjs — failures the UX net (flow 90-ux) expects TODAY.
// Each line is "check · page · width", matched exactly: a failure not listed
// fails the flow, and so does a listed one that stopped failing. When a task
// fixes one, it deletes the line (plan U: U·1 and U·2 empty this list but for
// lines owned by U4 or 1D). Counted checks carry a ceiling (" ≤ N"): more is
// worse and fails; lower the ceiling as a task reduces it. The comment says
// which finding of spec U it is. Full results: e2e/.out/90-ux-failures.txt.
// =============================================================================
export const KNOWN = [
  // S4/S12/S13 targets under 24 px → U·1c, U·2b (incl. the new pager links)
  'target · console-home · 320',
  'target · console-orders · 320',
  'target · console-product · 320 ≤ 23',
  'target · console-product-long · 320 ≤ 11',
  'target · console-settings-store · 320',
  'target · admin-merchants · 320 ≤ 35', // +1: 40-partners adds Mitti Handloom, one more row of the same debt
  'target · admin-merchant · 320',
  'target · admin-plans · 320 ≤ 3',
  'target · console-home · 390',
  'target · console-orders · 390',
  'target · console-product · 390 ≤ 25',
  'target · console-product-long · 390 ≤ 12',
  'target · console-settings-store · 390',
  'target · admin-merchants · 390 ≤ 35', // +1: 40-partners' store
  'target · admin-merchant · 390',
  'target · admin-plans · 390 ≤ 3',
  'target · console-home · 1280',
  'target · console-orders · 1280',
  'target · console-product · 1280 ≤ 25',
  'target · console-product-long · 1280 ≤ 12',
  'target · console-settings-store · 1280',
  'target · admin-merchants · 1280 ≤ 39', // +1: 40-partners' store
  'target · admin-merchant · 1280',
  'target · admin-plans · 1280 ≤ 3',
  'target · console-home · zoom200',
  'target · console-orders · zoom200',
  'target · console-product · zoom200 ≤ 25',
  'target · console-product-long · zoom200 ≤ 12',
  'target · console-settings-store · zoom200',
  'target · admin-merchants · zoom200 ≤ 38', // +1: 40-partners' store
  'target · admin-merchant · zoom200',
  'target · admin-plans · zoom200 ≤ 3',
  'target · support-admin-merchant · 390',
  'target · support-admin-merchant · 1280',
  // S3/S6 tables scroll sideways on phones → U·2b phone rows
  'table-scroll · console-orders · 320',
  'table-scroll · console-products · 320',
  'table-scroll · console-product · 320',
  'table-scroll · console-product-long · 320',
  'table-scroll · admin-merchants · 320',
  'table-scroll · admin-plans · 320',
  'table-scroll · console-orders · 390',
  'table-scroll · console-products · 390',
  'table-scroll · console-product · 390',
  'table-scroll · console-product-long · 390',
  'table-scroll · admin-merchants · 390',
  'table-scroll · admin-plans · 390',
  'table-scroll · console-orders · zoom200',
  'table-scroll · console-product · zoom200',
  'table-scroll · console-product-long · zoom200',
  'table-scroll · admin-plans · zoom200',
  'table-scroll · support-console-orders · 390',
]
