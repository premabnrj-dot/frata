import 'server-only'
import { sql, type SQL } from 'drizzle-orm'

// =============================================================================
// FILE: src/lib/db/price-predicates.ts — THE PRIOR PRICE in SQL, in one place (E-Commerce Amendment Rules 2026, from
// 1 Jan 2027; offers O·2 plan review 10). The lowest price in the 30 days before today's price took effect (the price
// carried into that window included), and only within 30 days of that change; null otherwise. A raise-then-cut shows
// no saving. Read by the storefront's variants (the struck "was" price) and tested on a real Postgres.
// =============================================================================

export const priorPriceSql = (tenantId: string, variantCol = '"variants"."id"'): SQL<string | null> => {
  const v = sql.raw(variantCol)
  return sql<string | null>`(select case when c.f > now() - interval '30 days' then (
      select min(h.price) from price_history h where h.tenant_id = ${tenantId} and h.variant_id = ${v} and h.from_at < c.f
        and h.from_at >= coalesce((select max(h2.from_at) from price_history h2 where h2.tenant_id = ${tenantId} and h2.variant_id = ${v} and h2.from_at <= c.f - interval '30 days'), '-infinity'::timestamptz))
    end from (select max(h0.from_at) f from price_history h0 where h0.tenant_id = ${tenantId} and h0.variant_id = ${v}) c)`
}
