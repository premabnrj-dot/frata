# ADR-0009: EkCode — one shopper account across Frrata shops (a network), on Frrata's own WhatsApp

Status: accepted (owner, 2026-11-09) · supersedes the CLAUDE.md line "A cross-brand shopper data network — not before
DPDP consent design and a decision superseding ADR-0002" · amends ADR-0002 (adds platform tables outside every tenant)

## Context
Shoppers type the same phone and address into every shop. KwikPass, Razorpay and Shop recognise them across stores
through a provider account keyed by the verified phone (research `docs/research/2026-11-09-shopper-login.md`). Meta
forbids one WhatsApp account sending login codes for many businesses — but allows a business to send codes for its OWN
login. So a shared "Verify via Frrata" sender is only lawful as a Frrata account the shopper signs into.

## Decision (owner, 2026-11-09)
1. **EkCode is a Frrata account for shoppers.** The shopper signs in to Frrata (phone + a WhatsApp code from Frrata's
   own number); Frrata then shares with the shop they are on only what they confirm, and only after their consent.
2. **Frrata is a Data Fiduciary for EkCode** (DPDP Act 2023; Rules 2025): its own itemised notice in English (owner: no Hindi in the product; the mark alone is Devanagari),
   a consent tap that is never preselected, withdrawal as easy as giving ("Forget me on other shops", "Delete my
   EkCode"), a named contact, a 72-hour breach runbook, rights answered within 90 days, every consent logged with its
   notice version and time. For each shop's own orders Frrata stays the shop's processor.
3. **Isolation stays two locks, plus a vault.** EkCode's tables live outside every tenant; `frata_app` holds no grant on
   them: they are read and written only through SECURITY DEFINER functions that require a fresh verified login for that
   phone and an open consent, and that write a disclosure row (which shop received what, when). A shop never sees a
   EkCode id: it gets a pairwise pseudonym (HMAC of the account and the shop), so two shops cannot correlate a shopper.
4. **WhatsApp is the only channel** for codes; email is the fallback. **No SMS** until the owner asks for it.
5. **Transactional WhatsApp from Frrata's number** (order confirmed, shipped, delivered, COD confirmation) for shoppers who
   hold a EkCode and opted in, until the shop connects its own number — subject to Meta's rules being confirmed
   (checked 2026-11-09: allowed with conditions); the message is Frrata's own ("via Frrata"), the shop's name a
   variable, never promotional; no WhatsApp platform data (read/delivered status, "not on WhatsApp", BSUID) passes to
   the shop (Meta's platform terms §4.1).
6. **Never**: fingerprinting visitors who never signed in; profiling or marketing to anyone under 18; selling or renting
   the network; marketing from EkCode (marketing stays in its own modules and the shop's own consents).

## Why
The network is the product's moat (a returning shopper filled in on a shop they have never visited) and the only lawful
way to use one WhatsApp sender for every shop. The vault, the pseudonyms and the disclosure log keep ADR-0002's promise:
one shop never reaches another's data, and Frrata's own app code cannot read the network without the shopper's fresh code.

## Consequences
- Counsel reviews the notice and the DPA before launch; DPDP duties bind from 13 May 2027 at the latest.
- Frrata's WhatsApp quality is shared by every shop: a low-quality template is paused, then disabled for all, and blocks
  limit growth. One template per order event, per-shop send limits and a breaker are part of the design.
- Frrata pays Meta for EkCode codes and for transactional messages it sends, metered per shop. Meta's terms forbid
  reselling the platform, so the cost is carried inside Frrata's fee until counsel clears a per-message line (no
  wallet: RBI).
- `tenancy-auditor`, `security-reviewer`, `unit-economics-reviewer` and `architecture-reviewer` run on the plan before code.
