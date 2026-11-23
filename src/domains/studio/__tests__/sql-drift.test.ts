import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CREDIT_COST_PAISE, LIMITS, LOADING_BP, LOW_EMAIL, RATE_MAX_AGE_DAYS, WARN_PCT } from '../credits'
import { FREE_CREDITS, FREE_DAYS, LOT_MONTHS, TYPED_MAX } from '../prices'
import { USE_WHAT } from '../ledger'

// The ledger's definers (drizzle/0164) restate the pure rules in SQL; these pin that each number is the same one
// (impact review, C1·2). A change to a rule in credits.ts or prices.ts fails here until the SQL follows.
// Each definer as it stands NOW: its latest `create or replace function` across every migration, so a later migration that
// redefines one is checked too (architecture review 2026-11-23).
const dir = join(process.cwd(), 'drizzle')
const latest = new Map<string, string>()
for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
  for (const part of readFileSync(join(dir, f), 'utf8').split(/(?=create or replace function )/i).slice(1)) {
    const name = /^create or replace function (\w+)/i.exec(part)?.[1]
    if (name && /^(app_pc_|app_partner_|app_fx_)/.test(name)) latest.set(name, part.split('--> statement-breakpoint')[0]!)
  }
}
const sql = [...latest.values()].join('\n')
const schema = readFileSync(join(process.cwd(), 'drizzle/0163_studio_credits.sql'), 'utf8')

describe('the SQL keeps the engine’s numbers', () => {
  it('the credit and its loading', () => {
    expect(sql).toContain(`ceil(v_paise / ${CREDIT_COST_PAISE})`)
    expect(schema).toContain(`"loading_bp" integer DEFAULT ${LOADING_BP}`)
  })
  it('the limits (decision 5)', () => {
    expect(sql).toContain(`v_n := least(${LIMITS.turnMax}, greatest(1, coalesce(p_estimate, ${LIMITS.turnDefault})))`)
    expect(sql).toContain(`+ v_n > ${LIMITS.personDay} then raise exception 'person_day'`)
    expect(sql).toContain(`>= ${LIMITS.platformDayListPaise} then`)
    expect(sql).toContain(`::date - ${RATE_MAX_AGE_DAYS} order by`)
  })
  it('the alerts', () => {
    expect(sql).toContain(`v_bal >= ${LOW_EMAIL} and v_bal - v_n < ${LOW_EMAIL}`)
    expect(sql).toContain(`v_used * 100 < v_budget * ${WARN_PCT} and (v_used + v_n) * 100 >= v_budget * ${WARN_PCT}`)
  })
  it('the free credits and every lot’s use-by', () => {
    expect(sql).toContain(`'grant', ${FREE_CREDITS}, now() + interval '${FREE_DAYS} days'`)
    expect(sql.match(new RegExp(`now\\(\\) \\+ interval '${LOT_MONTHS} months'`, 'g'))?.length).toBeGreaterThanOrEqual(2)
    expect(schema).toContain(`between 1 and ${TYPED_MAX}`)
  })
  it('the uses’ vocabulary', () => {
    expect(sql).toContain(`p_what not in (${USE_WHAT.map((w) => `'${w}'`).join(', ')})`)
  })
})
