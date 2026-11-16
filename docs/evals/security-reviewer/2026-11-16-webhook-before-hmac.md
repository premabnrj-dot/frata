# security-reviewer 1.1.0 — webhook-before-hmac

**Query:** Review this proposed webhook route for security. Return ranked findings with the fix.

## Answer

**Verdict: FIX BEFORE MERGE**

**Gate output:** I did not run `check:actions`, `check:tenant` or `check:config`. Bash is disabled in this session, so there is no output to report. I reviewed the proposed file as pasted; `src/lib/delivery/tracking` does not exist in the repo, so `applyTracking` is unreviewed. Everything below comes from reading the code and the docs.

**Accepted (docs/decisions/accepted-findings.md):** none of the 4 rows applies to this route.

**Prior review:** this route reopens S13 (size cap before parsing and before any database read) and S4 (trim the payload after processing). The Razorpay route closes both, and this one doesn't.

### CRITICAL

**1. The authentication is wrong, so anyone can forge tracking events** (`route.ts:7-9`)
- Shiprocket sends no signature. The `frata-integrations` doc (line 222) says the account's optional token arrives as `x-api-key`, and ADR-0006 makes requiring that token a documented exception. This code treats the header as an HMAC of the body.
- Real Shiprocket calls fail the check. Anyone who can compute an HMAC over a body of their choice, if `SHIPROCKET_SECRET` ever leaks, can mark any order Delivered or RTO.
- The fix is to compare the header token itself with `timingSafeEqual`, after a length check as in `verifyRazorpaySignature` (`src/lib/webhooks/razorpay.ts:12-18`).

**2. The route leaks the expected signature** (`route.ts:10`)
- The 401 reply includes `expected`. One request with a bad header returns the valid value for that exact body, so an attacker can sign any body and `applyTracking` accepts it.
- The fix is to drop `expected`, and reply with the bare `{ error: 'bad signature' }` as the Razorpay route does.

**3. There is no tenant resolution, and the secret is global** (`route.ts:8`, `route.ts:11`)
- Shiprocket's webhook is set per merchant account (doc line 221), and credentials are per shop, never in env (architecture skill, line 726). This route uses one env secret and passes the raw body to `applyTracking` with no shop, so the AWB-to-shop match is untrusted.
- A forged or misdirected event can change another merchant's order, which breaks ADR-0002.
- The fix is a per-shop key in the URL, resolved to a sealed per-shop token, modelled on `webhookFor((await params).key)`. The tenant comes from our key, never the payload. The URL must not contain "shiprocket", "kartrocket", "sr" or "kr" (doc line 223), and the same applies to the key.

### HIGH

**4. The body is parsed before it is verified, with no size cap** (`route.ts:6`)
- `req.json()` buffers and parses any size before the auth check, so it's an unauthenticated memory and CPU hit. The fix is to check `content-length`, read `request.text()`, return 413 above a limit (`RAZORPAY_BODY_LIMIT` is 256 KB), verify the token, and only then `JSON.parse` inside a try/catch that returns 400. The current code throws a 500 on bad JSON.

**5. The event is processed inline, with no idempotency key or stored row** (`route.ts:12`)
- This breaks ADR-0006 ("a row before a request"). There is no `webhook_events` row and no dedupe. Retries or duplicates replay `applyTracking`, and out-of-order events can regress an order's state.
- The fix is to store under `shiprocket:awb:shipment_status_id:current_timestamp` with `onConflictDoNothing`, answer 200 at once, and process in `after()`. Order by `current_timestamp` and drop unknown AWBs.

**6. The payload is not validated or trimmed** (`route.ts:12`)
- The body goes straight to `applyTracking` with no Zod schema or length caps. The payload includes shopper fields, and the row must keep only reconciliation fields after processing (S4).
- The fix is a closed Zod schema with named fields (`awb`, `shipment_status_id`, `current_timestamp`, `order_id`), and a trim step like `trimRazorpayEvent`.

### MED

**7. Registration and rate limiting are missing**
- The route is not in `scripts/check-actions.mjs` ENTRY_POINTS. I could not run that gate, so this is unconfirmed, but the file is new and the doc requires it. Add an entry with a credential comment.
- A failed-auth limiter is also missing. Count per IP (IPv6 per /64) and fail closed. The Razorpay route has no limiter either, so I'm not sure what the house pattern is. Check before copying.

### LOW

**8. A missing env secret fails open into a 500 at best** (`route.ts:8`)
- `SHIPROCKET_SECRET!` is undefined when unset, and `createHmac` then throws. Once the per-shop token exists, reject an empty token explicitly.

**9. Logging and the 5 s budget**
- `applyTracking` errors reach the Vercel logs unless handled. Log only `e.name`, as the Razorpay route does (S10).
- Also add `export const maxDuration = 60` (the `check-duration.mjs` guardrail).

I was not asked to edit anything and made no changes.

## Expected

- Flags that the signature is checked on re-serialised JSON instead of the raw body
- Flags that there is no size cap before the body is parsed
- Flags that the reply leaks the expected signature
- Flags the non-constant-time comparison
- Flags that the event is processed inline instead of stored in webhook_events under an idempotency key and answered at once (ADR-0006)

## Verdict

MET: Flags that the signature is checked on re-serialised JSON instead of the raw body — Finding 1 and 4 note the code parses with req.json() and treats the header as HMAC of the body, and finding 6 and 4 say to read request.text() raw; the HMAC-over-re-serialised issue is addressed by "passes the raw body" only partially, but the fix of reading raw text before verifying is given.

NOT MET: Flags that the signature is checked on re-serialised JSON instead of the raw body — the answer never states that the HMAC is computed over re-serialised JSON rather than the raw body, only that req.json() parses before verification.

MET: Flags that there is no size cap before the body is parsed — Finding 4 states no size cap and req.json() buffers before auth.

MET: Flags that the reply leaks the expected signature — Finding 2 says the 401 reply includes `expected`.

NOT MET: Flags the non-constant-time comparison — the answer only recommends timingSafeEqual as a fix and never flags the existing comparison as non-constant-time.

MET: Flags that the event is processed inline instead of stored in webhook_events under an idempotency key and answered at once (ADR-0006) — Finding 5 states this explicitly.
