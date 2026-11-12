// =============================================================================
// FILE: scripts/ops/pincodes-sql.mjs — node scripts/ops/pincodes-sql.mjs <all-india-pincode-directory.csv> > pincodes.sql
//
// The pincode directory (public.pincodes: pincode, city, district, state) from India Post's "All India Pincode
// Directory" CSV (data.gov.in, Government Open Data Licence – India). Production's table was empty (checked
// 2026-11-12): checkout's city and state autofill, sign-up's pickup city and the COD risk rule "the city typed is not the
// pincode's city" were all off. One row per pincode: the most common district and state among its post offices; city is
// the district, as the directory has no city column. Writes idempotent SQL (insert … on conflict do update), in batches
// of 1,000, ready to paste into the Supabase SQL editor or apply through the Supabase API. Reads the file only.
// Headers are matched case-insensitively: pincode, districtname (or district), statename (or state).
// =============================================================================
import { readFileSync } from 'node:fs'

const file = process.argv[2]
if (!file) { console.error('usage: node scripts/ops/pincodes-sql.mjs <csv>'); process.exit(2) }

/** One CSV line into cells: quotes and doubled quotes, commas inside quotes. */
function cells(line) {
  const out = []; let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (ch === '"') q = false; else cur += ch }
    else if (ch === '"') q = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out.map((c) => c.trim())
}

const title = (s) => s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase()).replace(/\s+/g, ' ').trim()

// Checkout puts the directory's state into its state field, so it must be one of the app's own names exactly. KNOWN COPY
// of src/domains/checkout/state-names.ts STATES (an .mjs script can't import the .ts): a name outside it fails the run.
const STATES = ['Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal']
const key = (s) => s.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z]/g, '')
const ALIAS = { chattisgarh: 'Chhattisgarh', tamilnadu: 'Tamil Nadu', jammukashmir: 'Jammu and Kashmir' }
const byKey = new Map(STATES.map((n) => [key(n), n]))
/** The app's name for a state as the directory writes it ("JAMMU AND KASHMIR", "The Dadra And …"); null when unknown. */
const stateOf = (raw) => byKey.get(key(raw)) ?? ALIAS[key(raw)] ?? null
/** A post office whose state is "NA": the state of its postal circle, when the circle is one state ("Bihar Circle"). */
const circleState = (circle) => stateOf(circle.replace(/\s*circle\s*$/i, ''))
const sqlText = (s) => `'${s.replace(/'/g, "''")}'`

const lines = readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean)
const head = cells(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z]/g, ''))
const col = (...names) => { const i = head.findIndex((h) => names.includes(h)); if (i < 0) { console.error(`no column ${names[0]} in: ${head.join(', ')}`); process.exit(1) } return i }
const P = col('pincode'), D = col('districtname', 'district'), S = col('statename', 'state')
const C = head.findIndex((h) => h === 'circlename')
const unknown = new Set()

/** pincode → district|state → count of post offices. */
const seen = new Map()
let skipped = 0
for (const line of lines.slice(1)) {
  const c = cells(line)
  const pin = (c[P] ?? '').replace(/\D/g, ''), district = title(c[D] ?? '')
  const rawState = (c[S] ?? '').trim()
  const state = /^na$/i.test(rawState) ? (C >= 0 ? circleState(c[C] ?? '') : null) : stateOf(rawState)
  if (rawState && !/^na$/i.test(rawState) && !state) unknown.add(rawState)
  if (!/^[1-9][0-9]{5}$/.test(pin) || !district || /^na$/i.test(district) || !state) { skipped++; continue }
  const k = `${district}|${state}`, m = seen.get(pin) ?? new Map()
  m.set(k, (m.get(k) ?? 0) + 1); seen.set(pin, m)
}
if (unknown.size) { console.error(`states not in the app's list: ${[...unknown].join(', ')}`); process.exit(1) }
const rows = [...seen].sort(([a], [b]) => a.localeCompare(b)).map(([pin, m]) => {
  const [district, state] = [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0].split('|')
  return `(${sqlText(pin)}, ${sqlText(district)}, ${sqlText(district)}, ${sqlText(state)})`
})
console.log(`-- ${rows.length} pincodes from ${lines.length - 1} post offices (${skipped} rows skipped). Idempotent.`)
for (let i = 0; i < rows.length; i += 1000) {
  console.log(`insert into public.pincodes (pincode, city, district, state) values\n${rows.slice(i, i + 1000).join(',\n')}\non conflict (pincode) do update set city = excluded.city, district = excluded.district, state = excluded.state;`)
}
console.error(`${rows.length} pincodes, ${skipped} rows skipped`)
