# ADR-0014: Frrata is the commerce backend; a shop's website is code

Status: accepted (owner, 2026-11-11: "Accept the north-star wording; partners get the builder first; we'll remove the
look/themes concept"; 2026-11-12, after the hosting wording was clarified: "I'm comfortable with the new approach") · proposal `docs/specs/2026-11-11-agentic-storefront.md` (mockup
https://claude.ai/artifact/K8QusFghYyKYsYtU678huQ) · supersedes, at V5, ADR-0012 (manifests as data)

## Context
Frrata grew a theme system (six themes, a customizer, Theme Studio's designs and pages) so a brand with no developer
gets a premium storefront. The owner wants developers and partners to be the storefront's core makers, with an agent
in the product doing the developer's work, and partners publishing agentic starters others build from. Earlier calls
reverse with it: the Storefront API was parked "everything runs on Frrata for now" (2026-11-11) and the in-console
Claude builder was skipped "Claude never runs on Frrata's servers" (2026-11-11).

## Decision
1. **North star.** "Frrata is the commerce backend for Indian D2C brands. A brand runs its business in the console; its
   website is code that a developer, a partner or Frrata's agent builds on the Storefront API. Frrata keeps what makes
   the brand money: catalogue, checkout, COD, payments, orders, shipping, GST." (CLAUDE.md and `frata-planning`.)
2. **A website is code in its own repository and its own isolated deployment**, holding one read-only public key and no
   database access, no secret. Generated code never runs in Frrata's console or checkout runtime.
3. **Checkout, payment, sign-in and personal data stay on Frrata's host.** A site hands the bag over by link.
4. **The agent works in a sandbox on a draft branch; a person publishes.** Partners get the builder first; brands later,
   once partner-built quality is measured.
5. **Themes retire.** No new theme work (Theme Studio TS1c–TS4 cancelled). Live looks keep rendering until each shop
   moves (V5); then the theme catalogue, the customizer and ADR-0012 are removed.
6. **Phases V0–V5** as in the proposal, each with its own spec, mockup and reviews; the kill signals there stand.

## Consequences
- ADR-0002 gains a third tenant source (a storefront key), as drafted in the Storefront API spec's SA0.
- The planning skill's rule "work that moves no ranked problem waits" now reads against the new north star.
- Hosting, agent and build costs become Frrata's to meter (credits, plans): `frata-unit-economics`.

## Amendment (owner, 2026-11-11, after five reviews: https://claude.ai/artifact/CukynMkEPgQcqWg8m8ZATW)
1. **Credits** are ₹6.33 of measured cost (model tokens, sandbox seconds, build minutes), sold at ₹19 (3×), estimated
   before a session and charged on actual use. Seats and credits are outside the partner share.
2. **Frrata's patch lane** is the one exception to rule 4: Frrata's security and legal fixes (a kit patch on a supported
   major) deploy to every site when the checks pass and nothing visibly changes; target 24 h to every hosted site.
3. **Content stays data:** pages' words, FAQ, policies, menus and announcements are edited in the console and served by
   the API; a site's code owns layout. The legal block is runtime data, never compiled in.
4. **Hosting** (wording clarified by the owner, 2026-11-12): shop websites run in a separate hosting account that
   Frrata owns, pays for and runs — never in the Vercel team that runs the console and checkout. Brands need no
   hosting account and deal with no host: they connect a domain in the console, and hosting is in their plan
   (allowances, then overage at 3× cost). Frrata reaches the host through a hosting adapter (the host can change), and
   a Frrata-owned router stands in front of every domain (checkout, orders, policies, share images stay Frrata's;
   headers and outbound limits set by Frrata). Before Frrata hosting exists (V1), a brand's own developer may host a
   site anywhere on the Storefront API; that is a choice, not a requirement. A hosting decision record amending
   ADR-0005 comes before V2.
5. **Checkout fixes first** (shipped separately, 2026-11-11).
6. **Partners are verified** (PAN or GSTIN, two-factor) before free credits or publishing; the brand owner grants each
   partner's scope per shop (build, preview, publish after approval), approves the exact version *(after handover,
   amendment 9 replaces "approves the exact version" with the brand's choice per partner)*, and removing a partner stops its sessions and routines and revokes its keys and code access in one step.
   **Before handover** (owner, 2026-11-12: "if the store isn't handed over, there is no need of owner approval during
   that time for partners"): while a partner-built shop has never had an owner, the partner publishes its website once
   the checks pass, with no approval step. The published version shows on a signed preview; the shop's public address
   keeps "Opening soon" (out of search) until the owner opens it, and the shop cannot open for orders until a brand
   owner claims it with a verified email (`drizzle/0066`, `app_shop_publish_needs_owner`). At handover the checks run
   again and the owner accepts that exact version and the partner's scopes; from then on the approval rule above
   applies. Details: `docs/specs/2026-11-12-kit-and-fleet.md`.
7. **Kit and fleet** (owner, 2026-11-12: "plan approved"; "yes, preview only guard before handover"):
   `docs/specs/2026-11-12-kit-and-fleet.md` is the plan for how Frrata's staff, fleet service and agents build the kit
   and starters, set controls, release updates (three lanes) and keep every site safe. Code sites live on their own
   registrable domain, never checkout's; its name is a placeholder (`frrata.site`) until chosen.

## Amendment 8 (owner, 2026-11-15: "1. yes. accept … go with rest of your suggestion"; spec `docs/specs/2026-11-14-site-content-layer.md`)
**Content is declared by code and edited as data.** Widens amendment 3.
1. **Three layers.** *Content* (announcements with dates, placements a site declares such as banners and featured
   collections or products, menus, page words, FAQ, size help, the Contact line) is edited in Console › Content, free,
   live on the next visit after at most 60 s or at its scheduled time, never through a build, an agent turn or a
   publish. *Design system* (brand tokens, logo, a season's tokens and dates) is **data** too (the kit spec's brand
   tokens, one source for site, checkout, emails and cards), edited by the partner in Studio's chat or directly on its
   preview, never a commit or a build. *Structure* (page types, layouts, components) is agent work: plan, checks, a
   person publishes.
2. **Who saves live.** Owners and admins. A partner before handover, or after it only with a content scope the owner
   grants (ADR-0015, never a Builder); the owner is told of each partner save. Support visits do not save content.
   *(Owner, 2026-11-15: "after handover, yes. as long as the partner is added in the store's account, he should be able
   to manage." Membership is the scope: the store's partner member saves before and after handover, with no separate
   grant. The store is told in Notices, one line per partner an hour, never sent to the saver; Activity has every save.)*
3. **The code declares, the console draws.** A code site declares its placements in its repository
   (`frrata/fields.json`, a closed set of field types, capped, no values and no secrets asked for); the publish gate
   validates it and keeps it with the published deployment; the console draws the editor from the live deployment;
   the Storefront API serves plain text, ids resolved inside the reading shop, Frrata media and shop paths. A future
   entry is never served before it starts; each live entry carries its end.
4. **One content source from V1.** Theme shops and code sites read the same content; the Look's announcement, menus
   and pages move to Console › Content (moving content out of themes, not new theme work).
5. **A gate before handover.** No code site is handed to a brand before Console › Content edits what that site
   declares. The editor follows what the builders put in the site: each section declares its editable fields as it
   is built (owner, 2026-11-15).

## Amendment 9 (owner, 2026-11-16: asked "shouldn't partners be able to update website as and when they wish, adding pages, redesigning etc?", then "yes. record and plan."; spec `docs/specs/2026-11-16-partner-publishing.md`)
**After handover, the brand chooses per partner how its partner publishes.** Replaces amendment 6's "approves the exact
version" for shops that have an owner. Before handover nothing changes (amendment 6, "Before handover").
1. **The choice, per partner, per shop**, in Settings › People, made by the owner or a Manager (`shop.manage`):
   **Publishes freely** (the default) — the partner adds pages, redesigns and publishes whenever they wish, with no
   approval step; or **Ask me first** — each publish waits for the owner's approval of that exact version, as before.
2. **Checks on every publish, either way.** Frrata's publish gate runs on the build output (kit spec § 4): no key or
   secret in the code, the legal block on every page, prices as the API gives them, checkout only through the bag
   link, pages that load and a bag that reaches checkout. A failing version is refused.
3. **Always the owner's yes, even when publishing freely:** a version that adds an outside script or service (a host
   not in the live version's scripts, connections, frames or images: pixels, chat widgets, anything loading code from
   another site); a change to the policy pages or the legal details; and pointing the site at another domain. The
   gate finds the first from the build output; the console enforces the other two (who edits policies, who sets the
   Website).
4. **Told after, with Undo.** Each free publish sends the store one Inbox line: who published, what changed, a
   preview link and **Undo**, which puts the previous version back in one tap (an owner or Manager). Activity keeps
   every publish.
5. **Never, either way:** prices, stock, orders, shoppers, payments or costs. The site reads with a public key and
   hands the bag to Frrata's checkout (decisions 2 and 3).
6. **Removing a partner** cuts all their access at once (amendment 6); the site keeps serving its live version.

