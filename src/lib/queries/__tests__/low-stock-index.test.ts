import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LOW_STOCK_AT } from '@/domains/catalogue/availability'

// The products list's Low stock reads LOW_STOCK_AT as a literal so the planner can use the partial index
// variants_tenant_product_low, whose WHERE holds the same number (products PR·1, speed review). Change one, change both.
describe('the Low stock index matches LOW_STOCK_AT', () => {
  it('names the same number in the schema and the migration', () => {
    const schema = readFileSync('src/lib/db/schema-catalogue.ts', 'utf8')
    const migration = readFileSync('drizzle/0120_products_low_stock.sql', 'utf8')
    expect(schema).toContain(`\${t.stock} between 1 and ${LOW_STOCK_AT}\``)
    expect(migration).toContain(`"variants"."stock" between 1 and ${LOW_STOCK_AT};`)
  })
})
