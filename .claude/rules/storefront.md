---
type: rule
status: active
paths:
  - "src/app/s/**"
---

# Storefront

The tenant comes from `tenantForHost(host)` only. Pages are cached
(`revalidate`), so nothing per-shopper or per-member is rendered on the server
without a cache key that includes it. No merchant cost reaches this surface
(ADR-0003); `npm run build` runs `check:client-bundle`. Phone first.
