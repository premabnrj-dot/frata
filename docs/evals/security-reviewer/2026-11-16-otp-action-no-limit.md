# security-reviewer 1.1.0 — otp-action-no-limit

**Query:** Review this proposed server action for security. Return ranked findings with the fix.

## Answer

**Verdict: FIX BEFORE MERGE.** The action is an unauthenticated, unlimited SMS/WhatsApp sender, and it reflects the provider's reply to the caller.

**Gate output**
- I could not run `check:actions`, `check:tenant` or `check:config`. Bash is disabled in this session, so there is no output to quote.
- By reading `scripts/check-actions.mjs:26`, `check:actions` should fail this file. It contains none of the `CHOKEPOINTS` (`requireMember`, `requireShop`, `requireEk` and so on), and it is not in `ENTRY_POINTS`. This is unconfirmed until the gate runs.
- `npm audit` is not needed, because no dependencies changed.

**Findings**

**CRITICAL — Anyone can trigger an unlimited stream of sends to any phone number.**
- Where: `src/app/s/[host]/account/actions.ts:4-6`.
  - The action has no caller check, no rate limit, no proof-of-work and no Origin or session binding. The only validation is `String(form.get('phone'))`.
  - An attacker can POST the action in a loop with a victim's number. That bombs the victim, burns Frrata's WhatsApp/Meta sending quota and money, and can get the sender number flagged or banned.
  - With a list of numbers, the same loop is a mass-harassment tool.
- Fix: do not add a new sender on the shop host. The existing flow in `src/lib/ekcode/signin.ts:28` (`sendCode`) already covers this.
  - It takes its flow handle from a sealed cookie.
  - It limits sends per number and per network (`narrow`/`wide` buckets, `networkBuckets(ipBucket(...))`, so IPv6 counts per /64).
  - It raises a proof-of-work step and fails closed.
  - It writes the attempt row before the request (ADR-0008).
  - It gives the same answer whether or not the number has an EkCode.
  - Route the shop's "sign in" link to ekcode.in as ADR-0009 describes. If an action must exist, it has to call `sendCode`. A limit written fresh in the action would be a second copy.

**HIGH — The provider's reply goes back to the browser.**
- Where: `actions.ts:6`, `return { ok: true, debug: res }`.
  - `res` is whatever `sendOtp` returns. That could be a Meta message id, an error body quoting the number, or the code itself.
  - Returning the code would let anyone sign in as any phone without owning it. `sendCode` returns only a sealed cookie or a reason code.
  - The reply must name its fields, and `debug` must go.
- Fix: return `{ ok: true }` or `{ ok: false, reason }` with fixed words, as `SendReply` does.

**HIGH — Number enumeration is open.**
- Where: `actions.ts:6`. `sendOtp` is not in the repo, so I cannot confirm what it returns for a number that has an account. If its reply differs between known and unknown numbers, it is an oracle for who has an EkCode.
- Fix: one identical answer for every number, as `sendCode` gives ("The same answer whether or not the number has an EkCode").

**MED — `@/lib/ekcode/otp` does not exist.**
- Where: `actions.ts:2`. `src/lib/ekcode/` has no `otp.ts`, and `sendOtp` is not defined anywhere in `src`. The file cannot build.
- Why it matters: it suggests an invented parallel path to the real flow. Whoever writes it will have to choose its limits, secrets and logging, and this draft chooses none of them.
- Fix: use the existing `signin.ts` entry points.

**MED — No Zod and no length cap on `phone`.**
- Where: `actions.ts:5`.
  - `String(form.get('phone'))` turns a missing field into the literal string `"null"`, and a `File` into `"[object File]"`.
  - There is no cap before it reaches `sendOtp`.
- Fix: parse with Zod (`.max(20)`), then `cleanMobile` (`src/domains/checkout/mobile.ts:7`), and refuse a non-Indian mobile number before any send.

**MED — The call is not written as a row first (ADR-0006/0008).**
- Where: `actions.ts:6`. The action calls out directly, with no attempt row committed first and no outcome row after. A crash or retry leaves no record, and it cannot be told apart from an abuse burst.
- Fix: `vault.issueCode` before the request and `markSent`/`markFailed` after, as in `signin.ts:37-45`.

**LOW — Logging is unconfirmed.**
- `sendOtp` is unseen, so I could not check what it logs on error. A raw error can carry the phone number (S10). The rule is `errName` only, and `check:logs` should be run.

**Not applicable**
- I found no tenant, row-ownership or merchant-content risk in this snippet. It takes no tenant id and reads no row.
- Nothing here touches cookie options, CSP, HSTS or secrets handling. The action belongs in the Zod, rate-limit and chokepoint checks, not the header ones.

**Previous review (S1–S14)**
- **Reopens S8:** the per-IP limit that was fixed with `ipBucket` is absent here.
- **Reopens S9:** there is no fail-closed limit at all.
- **Reopens S10 (unconfirmed):** only if `sendOtp` logs raw errors.
- Nothing else in S1–S14 is touched.

**Accepted (docs/decisions/accepted-findings.md)**
- None apply. Rows 1–4 cover the Vercel token, late captures, the pre-bash hook and Console bundle budgets, and none of those matches this action.

## Expected

- Flags that there is no rate limit, by phone and by IP (IPv6 per /64), failing closed
- Flags that the input has no Zod schema with a length cap
- Flags that the reply returns the raw provider result instead of named fields only
- Flags that the OTP send is a request a person waits on, which must be an attempt row committed before the request (ADR-0008)

## Verdict

MET: Flags that there is no rate limit, by phone and by IP (IPv6 per /64), failing closed
MET: Flags that the input has no Zod schema with a length cap
MET: Flags that the reply returns the raw provider result instead of named fields only
MET: Flags that the OTP send is a request a person waits on, which must be an attempt row committed before the request (ADR-0008)
