# ADR-0006: A call to the outside world is a row before it is a request

Status: accepted · 2026-11-06 · adopted from Ekatan's WhatsApp outbox

## Decision
- **Outbound** (WhatsApp, Meta CAPI, Google, Shiprocket): `enqueue()` an `outbox`
  row in the same transaction as the change that caused it, with a dedupe key.
  A sweep claims due rows with `FOR UPDATE SKIP LOCKED`, sends, and retries with
  backoff up to `MAX_ATTEMPTS` before marking the row dead.
- **Inbound** (Razorpay, Shiprocket, Meta webhooks): verify the provider's documented
  signature (on the RAW body where it signs the body; field by field for SNS, ADR-0011), insert into `webhook_events` under OUR key (provider:event:object)
  with `on conflict do nothing`, answer 200 at once, process later.

## Amendment (owner, 2026-11-08): an inbound webhook with no signature
Shiprocket's tracking webhook carries no signature, only an optional static token (`frata-integrations`
§ Shiprocket). Such a webhook is accepted only as a **trigger**, never as a fact:
- the URL's key only routes to a shop; the secret is the provider's token header, required, sealed, compared in
  constant time;
- the event is stored through a definer under OUR key, with the tenant in it (`provider:<tenant>:object:state:time`),
  only when the object is that tenant's; answered 200 at once;
- the processor **reads the state back from the provider's API with the shop's own credentials** before writing any
  state change, and clamps the provider's time to now plus a small skew;
- a sweep catches what the webhook missed.
A signed webhook (Razorpay, Meta) keeps the rule above. Spec: `docs/specs/2026-11-08-ship.md` § Reviews 2.

## Why
Providers deliver at least once and retry (Razorpay: 24 h, ~5 s timeout). An
order and its WhatsApp confirmation must commit together or not at all; a
retry must not send twice. A request made inside a transaction can neither be
rolled back nor retried safely.
