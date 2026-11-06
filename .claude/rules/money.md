---
type: rule
status: active
paths:
  - "src/domains/money/**"
  - "src/domains/orders/**"
---

# Money

Integer paise, basis points for rates (ADR-0004). Profit per order is
`orderProfit()` and nothing else computes a margin. A change to the formula is
a pricing change: run `unit-economics-reviewer` and update
`frata-unit-economics`.
