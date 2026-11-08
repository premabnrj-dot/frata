import 'server-only'
import { sql, type SQL } from 'drizzle-orm'
import { GOOGLE_ADS_KEYS, GOOGLE_FREE_KEYS, META_CLICK_KEYS, type SourceInputs } from '@/domains/analytics/source'

// =============================================================================
// FILE: src/lib/db/attribution-sql.ts
//
// AN ORDER'S ATTRIBUTION INPUTS IN SQL (Analytics A·1; impact review A1·7): the ONE way a query reads what
// sourceOfInputs classifies — the tags (trimmed, empty as null; source and medium lowercased, as the classifier reads
// them), the referrer's host, and which click ids the order has, from the classifier's own key lists. Analytics groups
// by these, a source's page matches on them, and the order page selects them, so all three classify alike. Each takes
// the alias `orders` has in the query.
// =============================================================================

type Inputs = { [K in Exclude<keyof SourceInputs, 'cl' | 'cc'>]: SQL }

/** The key lists are the classifier's constants (never input), so they are written into the statement. */
const anyOf = (a: SQL, keys: readonly string[]) => sql`coalesce(jsonb_exists_any(${a}, ${sql.raw(`array[${keys.map((k) => `'${k}'`).join(', ')}]`)}), false)`

export function attributionInputsSql(o = 'o'): Inputs {
  const a = sql.raw(`(${o}.checkout -> 'attribution')`)
  const text = (key: string) => sql`nullif(btrim(${a} ->> ${sql.raw(`'${key}'`)}), '')`
  return {
    us: sql`lower(${text('utm_source')})`, um: sql`lower(${text('utm_medium')})`, uc: text('utm_campaign'), rh: text('ref_host'),
    gads: anyOf(a, GOOGLE_ADS_KEYS), srs: anyOf(a, GOOGLE_FREE_KEYS), fb: anyOf(a, META_CLICK_KEYS),
  }
}
