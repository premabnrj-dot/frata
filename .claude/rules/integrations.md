---
type: rule
status: active
paths:
  - "src/app/api/**"
  - "src/lib/webhooks/**"
  - "src/lib/outbox/**"
  - "src/lib/connectors/**"
---

# Integrations

Load `frata-integrations` (facts, dated) and `frata-architecture` § Outside
world. Webhooks verify the raw body, store under our key, answer, and process
later; each route is listed in `scripts/check-actions.mjs` ENTRY_POINTS.
Outbound calls are outbox rows sent through `fetchWithTimeout`. A provider fact
older than 90 days → `integration-researcher` before building on it.
