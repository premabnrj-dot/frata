# ADR-0004: Money is an integer count of paise

Status: accepted · 2026-11-06

## Decision
Every amount is a `bigint` of paise in Postgres and a branded `Paise` number in
code (`src/domains/money/paise.ts`). Rates are basis points. Rupees exist only
at input and display (`src/lib/format.ts`, `<Money>`).

## Why
Floats drift (0.1 + 0.2 ≠ 0.3). Profit per order is reconciled against
Razorpay settlements and Shiprocket COD remittances, both in paise; a drifting
paisa per order makes the payout and the dashboard disagree.
