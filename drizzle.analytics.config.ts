import { defineConfig } from 'drizzle-kit'

// The analytics database (A·2): its own Postgres, its own migrations. `npm run db:generate:analytics`.
// Applied by scripts/verify/apply-analytics-migrations.sh (throwaway databases) and, in production, as the main
// database's migrations are (CLAUDE.md § Migrations), against the analytics project.
export default defineConfig({
  schema: ['./src/lib/db/analytics-schema.ts'],
  out: './drizzle-analytics',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.ANALYTICS_DATABASE_URL ?? '' },
})
