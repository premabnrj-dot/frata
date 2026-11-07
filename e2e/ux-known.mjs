// =============================================================================
// FILE: e2e/ux-known.mjs — failures the UX net (flow 90-ux) expects TODAY.
// Each line is "check · page · width", matched exactly: a failure not listed
// fails the flow, and so does a listed one that stopped failing. When a task
// fixes one, it deletes the line (plan U: U·1 and U·2 empty this list but for
// lines owned by U4 or 1D). Counted checks carry a ceiling (" ≤ N"): more is
// worse and fails; lower the ceiling as a task reduces it. The comment says
// which finding of spec U it is. Full results: e2e/.out/90-ux-failures.txt.
// =============================================================================
// Emptied by U·2b (2026-11-07): from 157 lines (U·0) to none. A new line is a regression to fix, not a debt.
export const KNOWN = []
