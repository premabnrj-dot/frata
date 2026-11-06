# ADR-0006: A call to the outside world is a row before it is a request

Status: accepted · 2026-11-06 · adopted from Ekatan's WhatsApp outbox

## Decision
- **Outbound** (WhatsApp, Meta CAPI, Google, Shiprocket): `enqueue()` an `outbox`
  row in the same transaction as the change that caused it, with a dedupe key.
  A sweep claims due rows with `FOR UPDATE SKIP LOCKED`, sends, and retries with
  backoff up to `MAX_ATTEMPTS` before marking the row dead.
- **Inbound** (Razorpay, Shiprocket, Meta webhooks): verify the signature on the
  RAW body, insert into `webhook_events` under OUR key (provider:event:object)
  with `on conflict do nothing`, answer 200 at once, process later.

## Why
Providers deliver at least once and retry (Razorpay: 24 h, ~5 s timeout). An
order and its WhatsApp confirmation must commit together or not at all; a
retry must not send twice. A request made inside a transaction can neither be
rolled back nor retried safely.
