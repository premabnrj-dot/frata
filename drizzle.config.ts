import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: ['./src/lib/db/schema.ts', './src/lib/db/schema-catalogue.ts', './src/lib/db/schema-orders.ts'],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
})
