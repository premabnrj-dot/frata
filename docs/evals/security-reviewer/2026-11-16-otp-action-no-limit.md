# security-reviewer 1.1.0 — otp-action-no-limit

**Query:** Review this proposed server action for security. Return ranked findings with the fix.

## Answer

**Verdict: FIX BEFORE MERGE.** Do not merge this action. It is an unauthenticated, unlimited WhatsApp sender, and it duplicates a flow that already exists and is hardened.

**Gate output:** I could not run `check:actions`, `check:tenant` or `check:config`. Bash is disabled in this session, so there is no output to report. I did not run `npm audit`, since no dependencies changed. Everything below comes from reading the code.

**What the code shows**
- `@/lib/ekcode/otp` does not exist. `src/lib/ekcode/` has no `otp.ts`, and nothing in `src` defines `sendOtp`. As written the file cannot build.
- No `'use server'` file exists under `src/app/s/` today, and the shop surface sends OTPs only through EkCode's own host.
- The real path is `src/app/api/ek/code/route.ts`, which calls `requireEk` (`src/lib/ekcode/require-ek.ts:20`) and then `sendCode` (`src/lib/ekcode/signin.ts:28`).

**CRITICAL**

1. **`actions.ts:5`: anyone can send WhatsApp codes to any number, with no limit.**
   - A server action is a public POST endpoint. This one has no tuple, no rate limit, and no proof-of-work or per-number cap.
   - An attacker loops `requestCode` over a phone list. That bombs victims with codes from EkCode's number and burns the Meta quota, which risks the number being flagged or banned. It also bills Frrata for every message.
   - **Fix:** delete this file. Send the shopper to EkCode's flow (ADR-0009), which gives you:
     - the sealed flow cookie;
     - proof-of-work;
     - the `issueCode` vault verdict, with per-handle, per-number and per-network caps;
     - the ADR-0008 attempt row committed before the send.
   - If a shop-side action is still wanted, it must not call `sendCode` directly.
   - It must go through `requireEk`-equivalent checks and `withinLimit` counting the phone key and the IP, with the IPv6 /64 bucket, failing closed (S8, S9).

**HIGH**

2. **`actions.ts:6`: `debug: res` returns the provider's raw reply to the browser.**
   - It can carry the code itself, the wamid, the access-token-bearing request details or Meta's error text, which can quote the number.
   - Anyone who can call the action reads the code and signs in as the shopper.
   - This breaks the "named fields only" rule and the comment in `signin.ts` that errors are our codes, never the provider's words.
   - **Fix:** return `{ ok: boolean }` or a closed reason enum (`invalid`, `wait`, `capped`, `off`), as `SendReply` does.

3. **`actions.ts:4`: no validation, and the reply says whether a send happened.**
   - `String(form.get('phone'))` turns a missing field into the string `"null"` and accepts any length.
   - `{ ok: true }` is returned whatever `sendOtp` did, so the UI cannot tell success from failure.
   - **Fix:**
     - Cap the length at 20, as the EkCode route does with `z.string().max(20)`.
     - Pass the result through `cleanMobile`.
     - Return `ok` only when the vault verdict is `ok`.
     - Give the same answer whether or not the number has an EkCode.

**MED**

4. **No Origin or Sec-Fetch-Site check of its own (unconfirmed).**
   - Next checks Origin for actions in general, but the shop is reached on merchants' custom hosts.
   - `requireEk` checks Origin and `Sec-Fetch-Site` itself and requires JSON, because shop hosts are many.
   - **Fix:** if the action stays, check the request's host against the shop host from `src/domains/tenancy/host.ts`.

5. **The tenant and the shop are never established.**
   - The action does not read the host, so the code cannot be tied to a shop's flow row. Nothing logs consent or which shop asked (ADR-0009).
   - **Fix:** use the flow cookie's handle and shop, never a field in the form.

**Accepted (`docs/decisions/accepted-findings.md`):** none of rows 1–4 match this change.

**Earlier review (S1–S14):**
- **S8 (IPv6 per /64):** this action would reopen it, because it has no limit at all.
- **S9 (fail closed):** same.
- **S10 (no raw errors in logs and replies):** reopened by `debug: res`.
- **S1–S7 and S11–S14:** not touched.

**Not checked:** CSP, HSTS and cookie options, which this diff does not touch. Webhooks, merchant content and environments are also out of scope for this file.

## Expected

- Flags that there is no rate limit, by phone and by IP (IPv6 per /64), failing closed
- Flags that the input has no Zod schema with a length cap
- Flags that the reply returns the raw provider result instead of named fields only
- Flags that the OTP send is a request a person waits on, which must be an attempt row committed before the request (ADR-0008)

## Verdict

MET: Flags that there is no rate limit, by phone and by IP (IPv6 per /64), failing closed
NOT MET: Flags that the input has no Zod schema with a length cap — it flags no validation and a length cap of 20 but only suggests `z.string().max(20)` as the EkCode route's approach, not a Zod schema as the fix for this action
MET: Flags that the reply returns the raw provider result instead of named fields only
NOT MET: Flags that the OTP send is a request a person waits on, which must be an attempt row committed before the request (ADR-0008) — it mentions the attempt row only as something EkCode's flow gives, not as a flagged defect in this action
