// =============================================================================
// FILE: scripts/lib/journal.mjs — what is wrong with drizzle's journal (drizzle/meta/_journal.json), read by
// `merge-main.mjs --journal` (check:migrations, in npm test: no network, no git) and `merge-main.mjs --check`.
//
// ⚠️ WHY AN OUT-OF-ORDER `when` FAILS. drizzle's migrator applies a file only when its `when` is later than the newest
// row in drizzle.__drizzle_migrations, so a file with an earlier `when` is silently skipped (frata-gotchas: "drizzle-kit
// silently skips a migration"). APPLIED_OUT_OF_ORDER lists entries that already ran in production out of order; it
// only shrinks, and a new entry is never added: give the migration a later `when` instead.
// =============================================================================

export const APPLIED_OUT_OF_ORDER = new Set([
  '0123_partner_teams', // when 1794513445653 is before 0122's; applied in production 2026-11-12 (both have their rows)
])

// entries: the journal's entries; files: the drizzle/NNNN_*.sql file names present.
export function journalProblems(entries, files) {
  const out = []
  entries.forEach((e, i) => {
    if (e.idx !== i) out.push(`journal entry ${e.tag} has idx ${e.idx}, expected ${i}`)
    if (!files.includes(`${e.tag}.sql`)) out.push(`journal names ${e.tag} but drizzle/${e.tag}.sql is missing`)
    if (i && e.when <= entries[i - 1].when && !APPLIED_OUT_OF_ORDER.has(e.tag)) {
      out.push(`journal entry ${e.tag}: when ${e.when} is not after ${entries[i - 1].tag}'s — drizzle would skip it; give it a later when`)
    }
  })
  const named = new Set(entries.map((e) => `${e.tag}.sql`))
  for (const f of files) if (!named.has(f)) out.push(`drizzle/${f} is not in the journal`)
  return out
}
