import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: ['./src/lib/db/schema.ts', './src/lib/db/schema-catalogue.ts', './src/lib/db/schema-orders.ts', './src/lib/db/schema-partners.ts', './src/lib/db/schema-modules.ts', './src/lib/db/schema-communication.ts', './src/lib/db/schema-discounts.ts', './src/lib/db/schema-themes.ts', './src/lib/db/schema-billing.ts', './src/lib/db/schema-trials.ts', './src/lib/db/schema-gst.ts', './src/lib/db/schema-addresses.ts', './src/lib/db/schema-ekcode.ts', './src/lib/db/schema-customers.ts', './src/lib/db/schema-infra.ts', './src/lib/modules/reviews/schema.ts'],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
})
