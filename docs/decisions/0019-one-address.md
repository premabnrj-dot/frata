# ADR-0019: One address per store: Frrata at the door, the site behind it, shopper data in a frame

Status: **accepted** (owner, 2026-11-16: "approve all" (decision page https://claude.ai/artifact/ChPS16kSEiabXz4J5Q7ALT); five independent reviews folded in the same day) · Source: `docs/specs/2026-11-16-one-address-checkout.md` · Plan:
`docs/plans/2026-11-16-one-address-checkout.md` · Supersedes: ADR-0014 amendments 4 and 7, ADR-0017 rules 3, 4 and 6, the
kit spec's § 1 (`docs/specs/2026-11-12-kit-and-fleet.md`) · Amends: ADR-0014 rules 2 and 3, ADR-0018 § 4, § 10 and its
test-key amendment · Studio's runtime record, drafted as ADR-0019, becomes ADR-0020.

## Context
- The owner, 2026-11-16: "the friction of dual subdomain for a store is not feasible at all … partners should be able to
  design the checkout, order pages as well, just not the data"; checkout and order pages "need to share the design
  language"; one logo across console and the partner's design; and "frrata.com will be the public domain. .shop will
  remain the subdomain".
- Today a code site runs on its own origin and hands its bag to checkout on `<store>.frrata.shop` by link. Two bags drift
  (the pilot's bug), the shopper changes address, and checkout wears the old theme.
- ADR-0014 rule 2 keeps generated code out of Frrata's runtime; rule 3 keeps checkout, payment, sign-in and personal data
  on Frrata's host. Amendment 7 put code sites on their own registrable domain to keep them away from checkout's origin.

## Decision
1. **One address per store:** the brand's domain, or `<store>.frrata.shop`. `frrata.com` is never a store or site host.
   No sites domain is bought; one separate preview domain is (point 8).
2. **Frrata at the door.** Frrata's app holds the store's host. Reserved paths (one list, `src/domains/tenancy/reserved.ts`:
   `^/(cart|checkout|orders|account|policies|api|_next|_frrata|_vercel|\.well-known|og|icon|email|s|secure)(/|$)` and
   `/fe.js`, case-insensitive) are Frrata's. Every other GET and HEAD goes to the store's one verified site deployment, with
   cookies and authorisation removed, request and response headers allowlisted and every `Set-Cookie` dropped; a
   filtering fallback runs at the edge, never as a regional function in front of every page. Only Frrata's app writes the
   routing, from one predicate: writers mark it dirty in their own transaction, and one sender in its own lane (never the
   shared outbox drain), taking a non-blocking lock, reads every store through one paged definer, publishes only the
   differences, reads them back, and is swept every five minutes; it fails closed.
3. **One predicate** (`app_website_of`) says whether a store's site is Frrata's, elsewhere, or code at one address; every
   reader of `site_origin` today moves to it; the routing map is a copy built from it.
4. **Rule 2, amended:** generated code never runs in Frrata's console or checkout runtime. In the shopper's browser it may
   share checkout's origin only under point 5.
5. **Rule 3, amended:** checkout, payment, sign-in and personal data stay in **Frrata's app**. On a one-address store the
   brand origin holds no secret and no shopper data: phone, address, sign-in, the order's priced summary, Place order and
   the order's personal details live in a frame on `secure.<store host>` (same site, other origin, rendered per request
   with a strict CSP, `__Host-` cookies only; a server-rendered form plus one standalone script of at most 25 kB, placed in
   checkout's server HTML with the bag in its URL). No store with real shoppers moves to one address before the frame ships.
   "A site hands the bag over by link" becomes "a site shares the store's one bag"; the bag link stays a frozen contract.
6. **Checkout's design is data** from the store's brand record and a closed checkout design, drawn by Frrata's code; a
   change on an open store by anyone but the owner or a Manager waits for the owner's yes.
7. **ADR-0018:** a public key answers for a store whose predicate is `one_address` as it does for a proved Website today;
   `siteOrigin` and `checkoutOrigin` then hold the same origin. Test keys before a domain are unchanged.
8. **Previews** live on one separate registrable domain where Frrata's app serves nothing (no fourth tenant source).
9. **`frrata.shop` goes to the Public Suffix List.** No security property depends on the listing: `__Host-` cookies only,
   no `Domain` cookie, and fetch metadata on every personal or state-changing route hold before it.

## Consequences
- Partner code shares checkout's origin in the browser. The residual risks (phishing on the brand's own domain, the frame
  shown on a partner page, cross-store cookie flooding before the listing) are named in the spec's § 2, with who carries
  each.
- A site page costs Frrata one more edge request and its document's bytes again, plus every RSC navigation and prefetch,
  on the `frata` team's bill: about ₹0.21 per 1,000 views on Vercel's Flat Rate CDN, ₹1.26–4.57 metered (₹103.40 a
  dollar). The router counts in ADR-0017 rule 11's kill line; hosting is priced only on measured numbers (the billing read
  and the pilot's request counts first). One address is parity with Shopify, not a gain; its gain is the checkout lift it
  must earn (H-1).
- EkCode's shop session moves to the secure host; current shoppers sign in once more.
- The Studio plan's V2a and BT change as the spec's last section lists.

## Owner decisions
The spec's § Owner decisions, 1–25.
