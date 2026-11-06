# ADR-0003: A merchant's costs never reach a shopper's browser

Status: accepted · 2026-11-06 · adapted from Ekatan's ADR-0003

## Decision
COGS, freight, gateway and COD fees, ad cost and Frata's fee are computed and
rendered on the server. Client components receive formatted values, never the
cost object. `scripts/check-client-bundle.mjs` runs after every build and fails
it if a cost field name (`scripts/cost-sentinels.mjs`) is in any browser chunk.

## Why
Anything a page imports is shipped to whoever loads it. Ekatan leaked its whole
cost catalogue to customers for five days because one browser module read one
row for a colour. The build output cannot lie; import rules can be bypassed by a
path nobody thought of.
