import { describe, expect, it } from 'vitest'
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core'
import { shopSettings } from '../schema'

// The shop_settings_sells CHECK is built from the category packs (plan 2026-11-23-c1-category-packs, C1a·4). Its SQL
// must stay byte for byte what drizzle/0070_serious_payback.sql:19 applied, or drizzle-kit would write a migration.
const sellsCheckSql = () => {
  const c = getTableConfig(shopSettings).checks.find((x) => x.name === 'shop_settings_sells')!
  return new PgDialect().sqlToQuery(c.value).sql
}

describe('shop_settings_sells', () => {
  it('renders the CHECK 0070 applied', () => {
    expect(sellsCheckSql()).toBe(`"shop_settings"."sells" <@ array['women','men','kids','ethnic','accessories','footwear','jewellery','beauty','wellness']::text[]`)
  })
})
