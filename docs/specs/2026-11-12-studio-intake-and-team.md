# Studio: brand intake and partner teams
Status: proposed (research, mockup and three reviews done; awaiting the owner) · Date: 2026-11-12 ·
Mockup: https://claude.ai/artifact/KiqKqrFCx4enB8KUrnh5Du (`docs/mockups/2026-11-13-studio-v2.html` v2.2: Intake, Team,
Design system) · Parent: `docs/specs/2026-11-11-frrata-studio.md` (V3) · Reviews: security and tenancy (both FIX
BEFORE MERGE, folded in below), integration-researcher (Instagram, `frata-integrations` 1.29.0)

## Owner decisions (2026-11-12, answering the v2.1 list)
1. **Intake: yes.** The first design system is built from the brand's existing branding.
2. **Migration from other platforms:** a later stage. Keep this scoped.
3. **Partner teams: yes.** A partner adds staff.
4. **Code export / leaving with the code:** later.
5. **Font and image rights checks:** not needed.
6. **Third-party scripts:** a later stage.
7. **Templates between partners:** a later stage.
8. **Credits after handover:** partners maintain sites for a fee. While a brand is linked to the partner, the partner
   uses its own credits on that brand's site. The brand never needs credits. (Revises the Studio spec's credits
   proposal: there is no "brand wallet".)

## Open for the owner
- **Q1 What a Builder sees in the console.** Today a partner is a full shop member: orders, shoppers' details, costs
  before handover, tax and delivery settings (`ANY_MEMBER`, `CAN_BUILD`). Both reviews rank this a blocker if
  Builders inherit it. **Recommended:** Owner and Lead keep today's `partner` powers; a Builder gets a new shop role,
  `builder`, outside `ANY_MEMBER`: Studio, the catalogue read-only and preview data only; never orders, shoppers or
  costs.
- **Q2 A person who is already the brand's own staff** can't also hold a partner membership there (members are keyed
  by shop and person). **Recommended:** refuse the assignment and say why.
- **Q3 Instagram needs Meta App Review and Business Verification** in the Pvt Ltd's name before brands we don't own
  can connect. **Recommended:** ship intake without it (logo, site, guide, photos, words); add Instagram once approved.

## Goal
Moves (5) a premium storefront without a developer per brand: a partner starts from what the brand already is, and a
partner with five people runs twenty brands. Measures: time from "New site" to an approved design system (target: same
day); edits to the agent's first system before approval; sites per partner person; credits per site by role.

## Job
When a partner starts a site, the brand sends what it already has in one link. The agent turns it into version 1 of
the design system, saying where each token came from and asking only where sources disagree. A partner's people
work only on the brands they are given, within a monthly cap; only leads and the owner publish, hand over or spend.

## Intake

### What the brand fills (no Frrata account; about five minutes on a phone; every step skippable)
1. **Logo:** SVG, PNG or PDF.
2. **Where the brand lives now:** website address; Instagram (connect only, once Q3 is settled; never a typed handle,
   which would need Business Discovery through Facebook Login and a Page).
3. **Brand guide and photos:** a PDF guide; up to 20 photos.
4. **In your words:** one line, words to use, words never to use, languages.

### What the agent does (design system v1 with sources)
| Source | Read for | How |
|---|---|---|
| Logo | Palette (top 5 by area), mark shape | Rasterised in the sandbox |
| Website (the brand's own) | Colours in use, fonts loaded, logo, button shape | Fetched by the egress proxy (rules below); no script run |
| Instagram | Palette and mood from recent posts | Read once through the brand's own read-only connection; only the derived palette and permalinks are kept (Meta terms §6.2) |
| Brand guide PDF | Stated hex codes, fonts, logo rules | Rasterised and text-extracted in the sandbox |
| Photos | Light, backgrounds, crops ("fits / busy background") | Re-encoded, then read in the sandbox |
| Words | brand.md: voice, use / never lists, languages | As typed, accepted by a person before entering brand.md |

- **Every token carries its source** (guide p.4, site CSS, logo, Instagram, the agent's choice), shown on the canvas.
- **Disagreements are questions.** Guide > site > Instagram > the agent's choice; each one is a tap to settle.
- **Fixes are proposed, not made silently** (an AA failure, a font the byte budget can't carry).
- **Not copied:** the old site's code and layouts. Facts are read; pages are built new on the kit.
- **The extractor has no tools.** Its output is a strict schema: hex colours, fonts from an allow-list, numbers, plain
  text. Nothing the brand sends (HTML, PDF text, captions, words) can reach brand.md or CSS as instructions.
- **Only the partner starts the extraction** (it costs the partner 8–15 credits, estimate first), never the link
  holder. The job takes its tenant from its outbox row and re-checks the token and the link when it runs.

### The link
- 128-bit random, stored as sha256 only; 14 days; one per site; revoked when the brand submits, the shop is handed
  over or the partner is unlinked.
- Opening it (GET) changes nothing (WhatsApp's link preview fetches it). Served on the console host with `no-store`,
  `Referrer-Policy: no-referrer`, `noindex`; never cached. The partner's name is plain text, with no links.
- **ADR-0002 amendment:** a second named exception to "the tenant comes from `requireMember` or the host": the intake
  definer takes only the token, looks up its hash, and takes the tenant from that row. It refuses revoked, expired
  and unlinked tokens. Storage keys are built from the returned intake id.
- Limits per link (files, total bytes) and per /64, failing closed.

### Files
Private storage, never served from the console or shop origin. Type checked by magic bytes on the server before the
row is written (not the browser's declared type). Photos re-encoded. SVG and PDF rasterised in the sandbox with caps
on pixels, pages, memory and time, and PDF JavaScript off. Originals deleted 30 days after the design system is
approved.

### The website fetch (in the egress proxy, never the sandbox)
- `https` on port 443 only, no cookies. The proxy resolves the host and connects to the address it checked (no DNS
  rebinding). It refuses RFC1918, loopback, 169.254/16, 100.64/10, fc00::/7, fe80::/10, `::ffff:` mapped
  addresses, 64:ff9b::/96, 0/8 and multicast.
- **The page and its own stylesheets and font files: at most 10 requests,** only from the page's registrable domain
  and the allowed font hosts. Each redirect checked again, at most 3.
- 5 MB counted while streaming; a time limit per request and in total.

### Instagram (after Q3)
- Its own connection: Instagram Login, `instagram_business_basic`, read-only. Never the console's messaging connection.
- OAuth `state` is a stored row bound to the token hash; no tenant in the callback URL.
- The access token is sealed per shop with a key id, never enters the sandbox (the proxy fetches the media), and is
  deleted after extraction unless the owner keeps it at handover.
- Captions on this route are unconfirmed (`frata-integrations` 1.29.0): voice comes from the brand's words, not captions,
  until a test on an account we own shows them.

## Partner teams

### Roles (on the partner)
| | Owner | Lead | Builder |
|---|---|---|---|
| Build, preview, pins, design system | ✓ | ✓ (assigned) | ✓ (assigned) |
| Send to the client, ask for an intake | ✓ | ✓ (assigned) | – |
| Publish the Studio site, hand over, approve routines | ✓ | ✓ (assigned) | – |
| Client budgets | ✓ | ✓ (assigned) | – |
| Buy credits, invoices, partner share | ✓ | – | – |
| Team: invite, roles, caps, remove | ✓ | – | – |

- Opening the shop itself stays `CAN_MANAGE` (the brand's people). A Builder's console reach is Q1.
- Only the owner changes roles and caps, never their own. Only Frrata removes the owner.
- **One wallet per partner.** A turn needs room under the person's monthly cap and the brand's budget. The ledger
  shows who spent what. A routine's approval is bound to a hash of that routine version.

### Sign-in and invites
- Passkeys for every partner person, in the console as well as Studio: `requireMember` refuses a partner membership,
  and `requirePartner` refuses anyone, without a recent passkey check (the staff-cookie pattern). Publish and hand
  over ask again. A person's first passkey and recovery are approved by the partner owner with the session code
  (staff passkeys spec § 2), never by email alone. The owner gets an email for every new passkey.
- Invites are bound to an email and claimed only by that confirmed email, on an explicit accept page (as `/handover`).
  Codes are stored hashed, single-use, 7 days, revocable. No phone invites (no SMS). One active partner per person.

### Data and the definers (tenancy audit 2026-11-12)
- `partner_members (partner_id, user_id, role, monthly_cap_credits, invited_at, accepted_at, removed_at)`, platform
  scope like `partners`: RLS on, no `frata_app` grant, revoked from `anon`, `authenticated` and `service_role`,
  `frata_admin` grants stated; unique `user_id` where `removed_at is null`. `partners.user_id` is backfilled as the
  first `owner` member. `partner_invites` likewise; `partner` stays out of the `invites_role` CHECK.
- Shop access stays a `members` row with role `partner` (Owner, Lead), one per assigned person, with
  `partner_member_id`. CHECK `(role = 'partner') = (partner_member_id is not null)`; existing rows backfilled.
- `app_access_for` counts a partner row only while its partner member is active, the partner is approved, the link
  to that shop is active and a passkey exists.
- **Rewritten on `partner_members`** (each keyed on `partners.user_id` today):
  - `app_remove_partner` (`0023`): deletes every partner-role member of the shop whose `partner_member_id` belongs to
    the linked partner, and in the same transaction revokes their invites, intake tokens, routines, keys and
    approval links, and stops their turns. Today it removes only the founding user.
  - New `admin_end_partner(partner)`: the same across all of the partner's shops (Admin today only sets
    `declined_at`).
  - `app_partner_assign` / `unassign`: derive everything. The caller is an active owner member; an active link exists
    for that shop and the caller's partner; the target belongs to the same partner, has accepted, isn't removed and
    has a passkey.
  - `app_my_partner`, `app_partner_clients` (assigned brands only; it returns owner emails today),
    `app_partner_create_shop` (`0066`), `app_handover_invite` (owner or assigned lead), `app_shop_people` (label
    staff with the partner's name).
  - `app_my_handovers` / `app_accept_handover`: refuse any active member of the linked partner. Today a colleague
    could accept the owner invite and become the shop's owner.
- **Removing a person:** one definer transaction ends their memberships, deletes their refresh tokens, revokes their
  keys and stops their open turns; their routines move to the owner. Tokens already issued can't be recalled, so
  access ends because membership and `removed_at` are checked on every request and inside every turn's own
  transaction.
- **Proof** (new section in `scripts/verify/tenancy.sql`):
  - removing a person, unlinking the brand, and Admin ending the partner each end access;
  - no passkey, no access;
  - a cross-partner assignment is refused;
  - a token from one shop can't write another;
  - no member of the linked partner can accept the handover;
  - a Builder can't read orders or shoppers (after Q1).

## Credits after handover (owner decision 8)
While a brand is linked, everything the partner does on its site (maintenance, routines, changes the brand asks for)
is paid from the partner's wallet; the brand pays the partner whatever they agree, outside Frrata. If the brand
unlinks the partner, every partner person's access ends and their routines stop; the site keeps running.

## Phases
- **T1 Teams** (can ship before Studio; partners use the workspace today): members, invites, passkeys in the console,
  assignment, the definer rewrites and proofs above, Q1.
- **I1 Intake** (with Studio V3's first slice): link, brand page, files, the proxy fetch, design system v1 with sources
  and questions. Instagram when Q3 clears.

## Design review
- **UI/UX:** a one-hand phone flow for the brand with "Skip" on every step; sources and questions in the partner's
  chat and canvas; Rule 0. The invite dialog shows field mistakes in place, with no toast (§ Feedback 4).
- **Tenancy:** the token-only definer (ADR-0002 amendment); partner rows tied to an active partner member, link and
  passkey; the definer rewrites; the proofs above.
- **Modularity:** extraction in the sandbox and the egress proxy, never the console runtime; tokens in `tokens.json`.
- **SSOT / DRY:** a token's source is stored with it; partner roles in one tuple read by the partner surface, the console
  and Studio.
- **YAGNI:** three roles; no custom roles; no per-brand role overrides; no phone invites.
- **KISS:** shop memberships stay the access model; one wallet.
- **Performance:** extraction is one queued sandbox job per intake; the brand page is uncached and light.
- **Reliability:** uploads resumable; extraction failures return credits only when Frrata's side failed.
- **Security:** everything in Intake and Sign-in above (link, files, fetch, Instagram, injection, invites, passkeys,
  removal). S1 (preview builds holding production data) must close before intake files exist.
- **Motion and visuals:** § Motion patterns: step progress, chips that pop, sources ticking in, a drawn check.
- **Unit economics:** intake 8–15 credits on the partner (₹152–285); teams free.
- **Blast radius:** partner identity moves from one user to a team: every partner definer, `requirePartner`,
  `requireMember` for partner rows, Admin's partner page, e2e 40-partners.

## Out of scope (owner, 2026-11-12)
Migration from other platforms; code export; font and image rights checks; third-party scripts; templates between
partners; a brand wallet.
