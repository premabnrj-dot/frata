# Set-up guide: the accounts the Studio and hosting work needs (owner's steps)
Status: draft, written 2026-11-24 by lane J from the repository only · Companion to `docs/setup.md` (S3, S8, S22, O4, O6, V3a) and `docs/plans/2026-11-24-domains.md`.

Do the steps in this order. Each says where to click, what to name things, what it costs **if the repo states a cost** (the file is quoted),
what to send back to the orchestrator, and what never goes into a chat. Where the repo gives no exact step, the line says
**"the repo does not say; the orchestrator will confirm"**: do not guess there, ask.

**Never paste into a chat, an email, a ticket or a document:** a password, a recovery code, a two-factor seed or backup code,
an API key or token (`sk-ant-…`, `ghp_…`, `github_pat_…`, `vcp_…`), a GitHub App private key (the `.pem` file), a webhook signing secret,
a card number. Send **names, ids and URLs** only. When a value must reach a system, the orchestrator sends a secure form (`docs/setup.md`
S3: "never paste a key in chat"); you type it into the form, or straight into Vercel with Production and **Sensitive** on.

## 1. The GitHub organisation `FrrataGit`
Owner decision, 2026-11-24: "A new GitHub organisation named FrrataGit in the same account" (replaces `frrata`; ADR-0016 amendment).
1. github.com → your avatar (top right) › **Your organizations** › **New organization** (or github.com/organizations/new).
2. Plan: **Free** to create (`docs/setup.md` S8: "Free plan, Actions off"). Name: `FrrataGit`. Contact email: the company's. It belongs to
   **My personal account**. Ownership of the account: the repo does not say if the organisation is to be billed to the company;
   the orchestrator will confirm.
3. Organisation › **Settings › Authentication security › Require two-factor authentication** (free, S8). Sign in to your own account with a passkey
   (ADR-0016: "Members sign in with passkeys").
4. Organisation › **Settings › Actions › General › Disable actions** for all repositories (S8 and the studio spec § 5: "GitHub Actions are off for the whole organisation").
5. **Members:** you only, as Owner. The repo does not name anyone else; add nobody until a developer needs a repository, and then to that repository only (ADR-0017: "a developer is added to that repository only").
6. **Upgrade to Team** (organisation › **Settings › Billing and plans**) when the first rulesets are tested: the spike's item 14 (a ruleset that names one App) and V2a's first partner
   site both need rulesets on private repositories, which need Team. Cost, quoted from `docs/setup.md:564`: "about $4 a member a month". A one-member
   organisation is therefore about $4 a month; the repo does not say whether that is before or after GST.
7. The old organisation `frrata` (https://github.com/frrata) holds the starter (`docs/setup.md:535`: `git clone https://github.com/frrata/starter`). Moving it into `FrrataGit`
   (repository › Settings › General › **Transfer**) is the orchestrator's step after you send the name; the repo does not say whether `frrata` is then deleted: the orchestrator will confirm.
**Send back:** the organisation's URL (`https://github.com/FrrataGit`), the plan it is on, the number of members.

## 2. The two GitHub Apps
Spec `docs/specs/2026-11-16-studio-agent.md` § 5 ("Two GitHub Apps", security H2). One App each for the agent's sessions and for the fleet, so a ruleset bypass is never in the agent's hands.
Create each in the organisation: **Settings › Developer settings › GitHub Apps › New GitHub App**.
| | Session App | Fleet App |
|---|---|---|
| Name | the repo does not say; the orchestrator will confirm (suggested: `Frrata session`) | the repo does not say; the orchestrator will confirm (suggested: `Frrata fleet`) |
| What it does | "contents read and write on one repository, minted per session, rotated within the hour, revoked at the end, and is never exempt from a ruleset" | "the only one that may update `main` and tags" |
| Repository permissions | **Contents: read and write.** Nothing else is named in the repo, so leave every other permission at *No access* | the repo does not say the exact list; the orchestrator will confirm. Do not tick any until it does |
| Install on | **one repository** at a time (the test repository in step 3 first); never "All repositories" | the repo does not say; the orchestrator will confirm |
| Webhook | the repo does not say; leave **Active** off until the orchestrator confirms | the same |
| Private key | Generate when asked. The `.pem` file goes **only** to the orchestrator's secure form or into Vercel as a Sensitive Production variable of the project the orchestrator names; never into a chat or a repository | the same, and the fleet's key lives in the `frrata-sites` team (step 4), never in the `frata` team |
Also: "Where can this GitHub App be installed?" → **Only on this account**.
**Send back:** each App's **name, App ID and Client ID** (shown on its settings page), and the installation id of each install. Never the private key or the client secret.

## 3. The test repository
The spike's items 2, 3 (private), 4 and 14 need it (`docs/research/2026-11-22-studio-agent-spike.md`: "a private repository `frrata/spike-fixture` holding `spike.mjs fixture`'s files").
1. FrrataGit › **New repository** › name **`spike-fixture`**, **Private**, no README, no template. (The earlier name was in `frrata`; the owner's change moves it.)
2. The orchestrator writes the files with `node scripts/studio/spike.mjs fixture <dir>` and hands them to you, or pushes them once the session App is installed on this repository.
   The repo does not say which of you pushes; the orchestrator will confirm.
3. Install the **session App** on this repository only.
4. After the first push, **Settings › Rules › Rulesets** is tried by the orchestrator, not by you; it needs Team (step 1.6).
**Send back:** the repository URL and the commit SHA of its first commit (the spike sets `SPIKE_FIXTURE_REPO_URL` and `SPIKE_FIXTURE_REPO_SHA` from them).

## 4. The Vercel team for partner sites
Owner decision, 2026-11-22: "keeping one vercel account for pilot/testing"; ADR-0017 "The decision as it stands" rule 3: **one** new Pro team now, three before outside partners' code is live.
1. vercel.com → the team switcher (top left) › **Create Team** (`docs/setup.md` S22).
2. Name: **`frrata-sites`**. Plan: **Pro**. Cost, quoted from `docs/setup.md` S22: "A Pro team is $20 a month plus its usage; nothing is hosted there until V2a."
3. **Settings › Deployment Protection › Standard Protection** on (S22).
4. **Region:** the repo says projects are in `bom1` (ADR-0017 rule 1, "Next.js native, bom1"); the setting is per project, made when the fleet creates a project, so nothing to choose on the team itself. Where in the dashboard: the repo does not say; the orchestrator will confirm.
5. Add this session's Vercel access to the team (S22: "the Vercel connector asks"). Accept the request; it grants the orchestrator's tools access to the team, not its secrets.
6. **Tokens: make none now.** The repo says the fleet service (V2a·5) is "the only holder of the host token" and the preflight refuses a host token of the `frata` team (ADR-0017 rule 3). So: no token exists until V2a·5; when it does,
   it is created in **`frrata-sites`**, stored only as a **Production, Sensitive** variable of the fleet's own project in that same team, never in the `frata` project and **nothing of it in the `frata` team**.
   What scope and expiry it has: the repo does not say; the orchestrator will confirm. A token in the `frata` team can deploy `frata`, change its firewall and repoint any store host (studio-workbench plan, S22 row), which is why.
7. Spike item 13 (a federation issuer `https://oidc.vercel.com/<team>` in the Claude Console) names this team's slug: send it back.
**Send back:** the team's **slug** and **team id** (Settings › General), the plan it is on. No token.
Open, not yours to settle: whether even one routing token may live in the `frata` team is the studio-workbench plan's open question (e).

## 5. The domain names
Decisions, 2026-11-24 (ADR-0019 amendment): stores on `frrata.online`, previews on `frratapreview.online`, Frrata's public site on `frrata.shop`.
1. **`frrata.online`:** get it for 3 years (owner, 2026-11-24: "It would be actually frrata.online for merchant subdomains"; earlier the same day, superseded: "I can renew this for 3 years" about `.store`). Whether you already hold it, the registrar and the price: the repo does not say; the orchestrator will confirm.
2. **`frratapreview.online`:** buy for 3 years (owner, 2026-11-24: "frratapreview.online for the testing"; earlier "can buy for 3 years"). The repo's earlier estimate for a preview domain, "about ₹3,200 for 3 years", was for a `.com`; the price of a `.online` name is not in the repo.
3. **`frrata.shop`:** stays; it is the public site now. Its 3-year renewal was "about ₹9,150 with GST" at Hostinger (`docs/setup.md` O4, before the change); keep it renewed (the old store addresses redirect from it for at least a year, `docs/plans/2026-11-24-domains.md`).
4. **DNS must be at Vercel for `frrata.online`.** The repo's rule (`frata-integrations` reference/platform.md): the wildcard `*.frrata.online` needs Vercel nameservers (or `_acme-challenge` delegation), "the registrar does not matter, the nameservers do" (`frrata.shop` was bought at Hostinger and uses `ns1/ns2.vercel-dns.com`). So at the registrar set the nameservers of `frrata.online` to Vercel's; the orchestrator gives the exact two names from the project's Domains page. `frratapreview.online` likewise if it gets a wildcard (the repo does not say).
5. **Registrar settings the repo does not state:** auto-renew, domain lock/transfer lock, WHOIS privacy, and which provider holds DNS beyond the nameserver rule above: the repo does not say; the orchestrator will confirm. Do not change them until it does, except to keep the name from lapsing: leave auto-renew as it is.
6. Do **not** add any of the names to the Vercel project yourself; the orchestrator does that in order (`docs/plans/2026-11-24-domains.md` § The order), so no live address breaks.
**Send back:** which registrar holds each of the three names, the expiry date shown for each, and (after step 4) a yes that the nameservers are set. No registrar password, no auth code.

## 6. The Anthropic `studio` workspace (needed before a partner uses Studio, not before)
`docs/setup.md` S3 and V3a step 1: the Console organisation exists and the **`studio-eval`** workspace and its key are live (2026-11-23). The **`studio`** workspace is to be made "before any partner uses Studio", with "its own spend limit and its own key", replacing the eval key (residual M3).
1. console.anthropic.com → **Workspaces** → create **`studio`**. The exact menu path: the repo does not say; the orchestrator will confirm.
2. **Spend limit:** the repo suggests `studio` **$300** a month "until the 20-task proof prices it", and `studio-eval` $100 (`docs/setup.md` S3). The limit stays on (setup.md V3a: "The workspace's spend limit stays on").
3. **API key** for that workspace: the orchestrator sends a secure form; you type the key there. It then goes to Vercel as `STUDIO_ANTHROPIC_KEY` (Production only, Sensitive), replacing the eval one; the orchestrator gives those steps. Never paste it in chat.
4. Cost: the model's price is metered by use and the limit above; the repo states no fee for a workspace itself.
**Send back:** the workspace's name and id, the limit you set. No key.

## 7. The exchange rate
Owner decision, 2026-11-24: "exchange rate, I'll enter quite often, i'll type."
- What it is: rupees to one US dollar, to four decimals (the writer's own example: "94.1997"), for the day. It prices every Studio turn (`frata-unit-economics` § The dollar rate).
- **How often:** every day or two. The code **stops every Studio turn when the newest rate is older than 4 days** (`RATE_MAX_AGE_DAYS`; C1 plan, setup.md V3a step 5).
- **Where:** Admin's screen for it comes with A1a (`docs/setup.md`: "no Admin screen calls it yet"); until it ships there is nowhere for you to type it. The repo does not say when; the orchestrator will confirm and tell you where to click. You need a passkey check in the last 5 minutes, as `src/lib/admin/fx-rate.ts` requires.
- Which number to type (the bank's rate, a site's rate): the repo does not say; its record is "the bank's actual rate" (C1 plan) and the orchestrator will confirm the source. The base used in plans today is ₹94 (₹93.93, x-rates.com, 2026-11-16).
**Send back:** nothing; tell the orchestrator the day you start typing it.

## What to send the orchestrator when you are done (names and ids only)
`FrrataGit` URL and plan · the two Apps' names, App IDs, Client IDs and installation ids · `spike-fixture`'s URL and first commit SHA · `frrata-sites` team slug and id · the registrar and expiry date of `frrata.online`, `frratapreview.online`, `frrata.shop` · the `studio` workspace's name and id (when you reach step 6).
