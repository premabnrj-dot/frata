import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: ['./src/lib/db/schema.ts', './src/lib/db/schema-catalogue.ts', './src/lib/db/schema-orders.ts', './src/lib/db/schema-partners.ts', './src/lib/db/schema-modules.ts', './src/lib/db/schema-communication.ts', './src/lib/db/schema-themes.ts'],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
})
