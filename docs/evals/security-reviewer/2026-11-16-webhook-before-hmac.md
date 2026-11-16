# security-reviewer 1.1.0 — webhook-before-hmac

**Query:** Review this proposed webhook route for security. Return ranked findings with the fix.

## Answer

**Verdict: FIX BEFORE MERGE**

**Gate output:** I did not run `check:actions`, `check:tenant` or `check:config`, because Bash is disabled in this session. `npm audit` is not relevant, since no dependencies changed. I also did not read the S1–S14 review. The only S-number I can tie to this route is S13 (size cap before parsing), which the Razorpay route's own comment cites.

**Accepted:** none. I checked all four rows in `docs/decisions/accepted-findings.md` and none cover this route.

## CRITICAL

**1. The 401 response hands out the valid signature, so authentication is bypassed.** (`route.ts`, the `return NextResponse.json({ error: 'bad signature', expected }, …)` line)
- An attacker POSTs any JSON body with no header. The 401 reply contains `expected`, the HMAC of that exact body. They resend the same body with `x-api-key: <expected>` and pass the check.
- The fix is to never put a secret, an expected value or a computed digest in a reply. Reply `{ error: 'unauthorized' }` and nothing else.

## HIGH

**2. The auth scheme is invented and cannot work.**
- Shiprocket sends a static token in `x-api-key` and no signature (`.claude/skills/frata-integrations/reference/shipping.md:76-78`; ADR-0006 amendment).
- This code compares the header to an HMAC of the re-serialized body, so a real Shiprocket delivery would never match. If the code were "fixed" by loosening the check, it would be open to anyone.
- The fix is to follow the ADR-0006 amendment. Use the URL key only to find the shop. Take the token from a per-shop sealed secret and compare it in constant time against the `x-api-key` header.

**3. There is no tenant, and the body is trusted as fact.**
- The route has one global `SHIPROCKET_SECRET` and no shop key, so `applyTracking(body)` can only take the tenant or AWB from the payload. That breaks ADR-0002 (tenant never comes from a body). An AWB belonging to shop A could be updated by anyone holding shop B's token.
- It also writes state straight from the payload. The amendment requires that the processor read the state back from Shiprocket's API with the shop's own credentials, and clamp the provider's time to now plus a small skew.
- The fix is to use the route `src/app/api/webhooks/shiprocket/[key]/route.ts`, as the Razorpay route does. Resolve the shop with a definer. Store the event, and drop AWBs that are not that tenant's.

**4. There is no size cap, and the body is parsed before authentication.** (`await req.json()`, first line)
- Anyone can send an arbitrarily large body, which is parsed in memory before any check. Malformed JSON throws an unhandled 500.
- This is the S13 pattern. The fix is to check `content-length` and then `raw.length` against a limit, read `req.text()`, authenticate, and only then `JSON.parse` inside a try/catch that returns 400. Copy `razorpay/[key]/route.ts:14-21`.

## MED

**5. The compare is not timing-safe.** (`sig != expected`)
- Use `timingSafeEqual` on equal-length buffers, for example by hashing both sides first. This disappears once finding 2 is fixed.

**6. It does not follow ADR-0006: no event row, no idempotency key, and processing happens inline.**
- `await applyTracking(body)` runs before the 200. Shiprocket retries are undocumented, so a retry re-applies the event, and a slow run risks a timeout.
- The fix is to insert into `webhook_events` under `shiprocket:<tenant>:<awb>:<status_id>:<current_timestamp>` with `on conflict do nothing`. Answer 200 at once and process in `after()`. Add `export const maxDuration = 60`. Trim the stored payload after processing.

**7. Config and gates.**
- `process.env.SHIPROCKET_SECRET!` bypasses `src/lib/env.ts`, the one owner module. If the variable is unset, `createHmac` throws and the route returns a 500. A single global env secret also contradicts "sealed per shop".
- The route is probably missing from `scripts/check-actions.mjs` ENTRY_POINTS and lacks the credential comment the other routes carry. I could not run the gates, so this is **unconfirmed**.

## LOW

**8. The URL breaks Shiprocket's own rule.** Shiprocket rejects webhook URLs containing "shiprocket", "kartrocket", "sr" or "kr" (`shipping.md:78`). `/api/webhooks/shiprocket` contains "shiprocket", so Shiprocket will likely refuse to register it. Use an opaque `[key]` path segment instead.

**9. The import is unconfirmed.** `@/lib/delivery/tracking` and `applyTracking` appear only in eval files. I found no implementation in the repo, so I can't tell whether it is tenant-scoped or reads through `src/lib/queries/`. That must be reviewed with the route.

I edited no files.

## Expected

- Flags that the signature is checked on re-serialised JSON instead of the raw body
- Flags that there is no size cap before the body is parsed
- Flags that the reply leaks the expected signature
- Flags the non-constant-time comparison
- Flags that the event is processed inline instead of stored in webhook_events under an idempotency key and answered at once (ADR-0006)

## Verdict

MET: Flags that the signature is checked on re-serialised JSON instead of the raw body — finding 2 states the code compares the header to an HMAC of the re-serialized body, and finding 4 says to read `req.text()` and authenticate before parsing.
MET: Flags that there is no size cap before the body is parsed — finding 4 states there is no size cap and the body is parsed before authentication.
MET: Flags that the reply leaks the expected signature — critical finding 1 says the 401 response returns `expected`, the valid HMAC.
MET: Flags the non-constant-time comparison — finding 5 says the compare is not timing-safe and recommends `timingSafeEqual`.
MET: Flags that the event is processed inline instead of stored in webhook_events under an idempotency key and answered at once (ADR-0006) — finding 6 says no event row or idempotency key, processing inline, and recommends inserting into `webhook_events` and answering 200 at once.
