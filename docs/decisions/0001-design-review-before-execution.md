# ADR-0001: No feature is executed before its review and mockup are signed off

Status: accepted · 2026-11-06 · adopted from Ekatan's ADR-0001

## Decision
A feature, enhancement or redesign starts with research on how strong products
solve the same job, then a spec with the design review (`frata-planning`) and an
HTML mockup the owner approves. Only then a plan, then code. Bug fixes and
one-file changes are exempt; the commit message says why.

## Why
Ekatan found that screens built without an approved drawing were rebuilt, and
that most "new" needs were options on something that existed. Research and a
mockup are cheaper than a rebuild. With one builder and an AI pair, the mockup
is also the only place the owner sees the work before it is done.
