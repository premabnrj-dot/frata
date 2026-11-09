# ADR-0008: An interactive call is an attempt row before it is a request

Status: accepted · 2026-11-09 · amends ADR-0006 · signed by the owner 2026-11-09

## Context
Filing GSTR-1 through a GSP (GST app G2, plan `docs/plans/2026-11-09-gst-core-and-categories.md` § 3 phase 5) is a
conversation with a person waiting: the portal texts an OTP, the merchant types it within minutes, and the push, the
summary and the filing each answer at once. An outbox row swept every minute can't carry an OTP the person is
holding, and the person must see the portal's answer (an ARN, a refusal) before leaving the page.

## Decision
A call made while a person waits for its answer may be made from the request, not the outbox, when all of these hold:
- an **attempt row** (`gst_attempts`: kind, period, actor, `pending`) is written and **committed before** the request,
  in its own transaction; the outcome (`ok` / `failed`, an error code, never a token or an OTP) is written after it,
  once (a trigger refuses a second outcome);
- the request is never made inside a database transaction;
- the effect of success is written with the outcome, in the same transaction (the session sealed, the push's totals,
  the ARN on the filing row, which is final once filed);
- a `pending` attempt older than a few minutes is an **unknown outcome**: the page offers "Check again" against the
  provider (the portal's summary), and never repeats a final act (filing) blindly; the provider's own state decides.
Everything else that calls out keeps ADR-0006.

## Why
The person needs the answer now; an outbox would make them wait or poll. The attempt row keeps ADR-0006's point —
nothing leaves without a record, and a crash between the request and the outcome is visible, not silent.
