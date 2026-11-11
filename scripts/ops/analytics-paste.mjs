#!/usr/bin/env node
// Prints one transaction holding every drizzle-analytics/*.sql migration from FROM on (default all) and its
// drizzle.__drizzle_migrations row (sha256 of the file, the journal's `when`), for the analytics project's SQL editor.
// The analytics project is in a separate Supabase account, so its migrations are pasted by the owner (plan
// docs/plans/2026-11-11-guardrails-infra-a2.md § A2·1 as built). Derived from the files each time: never edit the output.
//   node scripts/ops/analytics-paste.mjs > /tmp/analytics-apply.sql        FROM=0003 node scripts/ops/analytics-paste.mjs
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const from = process.env.FROM ?? '0000'
const journal = JSON.parse(readFileSync('drizzle-analytics/meta/_journal.json', 'utf8'))
let out = `-- Frrata analytics database (A·2): migrations from ${from}. Run once in the frata-analytics project's SQL editor.\n`
  + '-- One transaction: if any line fails, nothing is applied. 0000 refuses to run on the main database.\nbegin;\n'
  + 'create schema if not exists drizzle;\n'
  + 'create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint);\n'
for (const e of journal.entries) {
  if (e.tag.slice(0, 4) < from) continue
  const raw = readFileSync(`drizzle-analytics/${e.tag}.sql`, 'utf8')
  const hash = createHash('sha256').update(raw).digest('hex')
  out += `\n-- ===== ${e.tag} =====\n${raw.replaceAll('--> statement-breakpoint', '')}\n`
  out += `insert into drizzle.__drizzle_migrations (hash, created_at) values ('${hash}', ${e.when});\n`
}
out += '\ncommit;\n\n-- Afterwards: the migrations recorded, and pg_cron\'s two jobs.\n'
  + 'select id, created_at from drizzle.__drizzle_migrations order by id;\nselect jobname, schedule, active from cron.job;\n'
process.stdout.write(out)
