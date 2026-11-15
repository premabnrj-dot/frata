# Studio · one screen: the chat runs the whole flow
Status: active (owner 2026-11-15: "approved. yes to phone. draw the no-logo part too."; the Studio mockup's site view now IS this screen: "frrata mockup still use multi screens"); nothing built · Date: 2026-11-15 · Mockup: https://claude.ai/artifact/LdA5saPkzt36W1zJsxF1QZ
`docs/mockups/2026-11-15-studio-one-screen.html` · Approved: — · Owner (2026-11-15): "we have screens for setting up
brand identity, could all of this be as one screen, a flow completely handled by the chat. each and every part of it,
I want a mockup first. cleaner, simpler, most userfriendly, understandable ux." · Replaces: the Build view's stage
panels in `docs/specs/2026-11-12-studio-shell-clients-billing.md` and mockup v2.4/2.5 (Brand form, the design
system's nine tabs, the Pages form, the toolbar of five buttons). Clients, Billing, Team and Settings stay as drawn.

## Goal
Ranked problem (5) a premium storefront, built by partners. Measures (from V3's first 20 partner sites): a partner gets
from "new site" to a site ready to send in one sitting, median ≤ 45 minutes; ≤ 1 hand-typed instruction before the
first preview (choices first); every step reachable without leaving the screen.

## Job
A partner sets up a brand's identity and its first pages by answering the agent's questions with taps, watching the
site change beside the chat, and sends it to the brand, without learning a tool.

## Design (one screen)
- **Top bar:** Clients · the brand · progress (Brand · Look · Pages · Site · Hand over, derived from the chat, not
  navigation) · credits · one primary action that follows the step (Send to Riya, then Hand over).
- **Left, the chat:** every step is a card with choices: where to start (the console's catalogue, Riya's link, a
  website or Instagram); the brand in one line (editable) and three voices, each shown as a real headline; who buys
  (chips); three complete looks (palette and type, drawn); pages to start with (ticks with credits each and the total);
  building (a line per page, Stop beside the composer); ready (checks, what Riya will be able to edit, Send to Riya);
  Riya's review in the same thread; Hand over as a card. Work lines are one line each. Suggestions sit above the
  composer for the step; typing always works.
- **Right, the site:** the real preview, phone first, Computer one tap; it changes with each choice. Tap a part of it
  to edit by hand (a small popover); each hand edit is a line in the chat ("You changed Accent to #A3471C").
- **Brand book:** a drawer over the preview (one line, voice, who buys, words, look, type), never a page.
- **Phone:** the chat fills the screen; "Site" opens the preview as a sheet; the progress shows the current step only.
- **Choice cards** carry Write my own and Skip; hovering or focusing a voice or a look shows it on the site first;
  looks offer Keep Kesar's gold and Shuffle colours; tapping the preview attaches that part ("Home hero") to the chat.
- **Versions:** a drawer beside the Brand book; every choice and hand edit is a version; Restore keeps the chat.
- **States drawn:** couldn't read (a private Instagram: Try again, Skip it, Ask Riya), low credits (12 left, Build
  waits, Top up), building (Stop), approved by Riya, accepted at hand over.
- Kept from the content layer (owner 2026-11-15): tokens and seasons are brand data; "Riya will be able to edit" on
  the ready card; the Editable list and the Data list live in the drawer for the builder who wants them.

## Research (sources dated, checked 2026-11-15; links in the research pass)
| Product · date | What it does | Taken |
|---|---|---|
| Lovable · docs 2026-11-13, 2026-10-21 | Chat left, live preview; question cards (≤ 4, options, write your own, Skip); select an element and it attaches to the chat; every change a version, restoring keeps the chat | Question cards with Write my own and Skip; tap the preview attaches it to the chat; Versions with Restore |
| v0 design mode · 2026-11-13 | Hand edits wait as pending, then Apply sends them to the chat as a version | Every hand edit is a chat line and a version |
| Bolt visual edits · 2026-09-03 | A count of pending hand edits above the chat box | Hand edits always visible in the thread |
| Shopify Canvas · 2026-10-01 (Ask Phill 2026-10-07) | Chat plus a canvas of the real store; Sidekick offers distinct design directions; an AI edit clears undo; desktop only | Three complete looks to react to; undo never cleared; the preview runs the real kit |
| Relume · 2026-05-18 | Shuffle colours, lock the brand colour, several full concepts | Keep the brand's colour, Shuffle colours |
| Framer agent critique · Pratt 2026-09-08 | Chat and the style panel fight for one panel; no "done" state or cost; chats cleared on reload | Chat and preview never share a panel; cost before every run; a clear Ready card; the thread is kept |
| NN/g "Less chat, more answer" · 2026-04-17 | Answer first, short; say plainly what it can't do | One-line agent messages; a refusal says what to do |
| UXmatters · 2026-07-06 | Trust in the first session from what people can see, try, control and undo | Start cards instead of a blank box; preview before choosing |
| Waterloo GI 2026 | Guided questions cut rework but cost time | The fewest questions: one line, voice, who buys, look, pages |
| Microsoft Research · 2025-12-10 | Options feel opaque until the output shows | Hover or focus a voice or a look and the site shows it first |
No current source: Squarespace Blueprint, Durable, Shopify's 2025 AI store builder, ChatGPT canvas, NN/g's 2024–25
prompt-control articles (all older than 12 months or undated).

**Phone (owner, 2026-11-15: yes):** Shopify Canvas and v0 leave editing off phones; Lovable keeps a prompt-only phone
app. The mockup keeps the chat on the phone with the site as a sheet, so a partner can answer Riya and make a small
change away from a computer; the full build is meant for a computer.

## Design review (short; full review before the build plan)
- **UI/UX:** one primary action at a time; choices over typing; the preview always visible on a computer; Rule 0: the
  agent's lines are one sentence; states above.
- **Tenancy / security:** unchanged from the Studio specs (the session acts for one shop; nothing new is stored).
- **Unit economics:** each step shows its credits before it runs; choices cost the same turns as typed asks.
- **Blast radius:** the Studio shell spec's Build view; the v2.5 mockup's rail tabs move into the drawer.

## Out of scope
Clients, Billing, Team, Settings (unchanged) · the brand's own chat (later, ADR-0014).

## No logo (owner, 2026-11-15: "draw the no-logo part too"; "use some good logo designing skills"; then "approved. go with saffron threads for kesar")
When the console, the link and Instagram hold no logo, the chat offers three directions, each from a reason in the
brand (Kesar: **Saffron threads**, kesar is saffron; **Woven K**, warp and weft over and under; **Zari border**, the
sari's edge), drawn as one-colour marks plus the brand accent. Each card shows the logo on paper and on ink and the
icon at 32 and 16 px; hovering previews it in the site's header; choosing it puts it in brand data (site, checkout,
emails, share cards). Upload a logo, Ask Riya for hers, Write my own stay one tap away. **Kesar's logo: Saffron threads** (owner,
2026-11-15). The agent's logo skill and
checks: § Logo skill.

## Logo skill (research 2026-11-15; repos cloned and checked: last commit, LICENSE)
What Studio's agent uses to design and prove a logo (V3; the logo itself is brand data from V1.5):
| Use | What | Licence · last update | How |
|---|---|---|---|
| The agent's logo skill | `kaankiziltug/logo-design-skill` (SKILL.md, 13 references, audit and test-sheet scripts) | MIT · 2026-11-13 | Fork the SKILL.md and references as the base of Studio's skill, cut to wordmarks, monograms and wordmark-plus-mark; its "three concepts, checkpoint, then the kit" is this screen's flow. **Never ship its `assets/library/svg/`** (1,432 real logos; its TRADEMARKS.md excludes them from MIT) |
| Name to outlines | `harfbuzz/harfbuzzjs` | MIT-style · v1.6.4, 2026-10-22 | Sets the name in the chosen font with kerning and shapes Devanagari, Tamil and Bengali properly (opentype.js does not); glyph paths become the logo's outlines |
| Fonts | Google Fonts `ofl/` and `apache/` only | OFL FAQ updated 2026-11-09 | ~30 curated faces incl. Noto, Mukta, Anek, Tiro, Hind, Rozha One, Martel; logos are allowed, the artwork is the maker's, no attribution; **always outlines, never an embedded font** |
| Render checks | `yisibl/resvg-js` | MPL-2.0 · 2026-03-26 (pin) | PNGs at 16, 32, 48, 512 px; one colour; reversed; on the brand colour; blur; the agent looks before it shows |
| Clean-up | `svg/svgo` | MIT · 2026-11-07 | Last step before brand data; keep the `viewBox` |
| Reading only | `rampstackco/claude-skills` logo-design (MIT); `anthropics/skills` frontend-design (Apache-2.0, attribution if quoted) | 2026-10-04; 2026-09-03 | Mark types and application contexts; deliberate type choice |
Not used: anthropics/skills brand-guidelines, theme-factory, canvas-design, algorithmic-art (not logo work); skills with
no licence file (no right to reuse) or one-day histories.

**The checks every concept passes before the chat shows it** (the card's "16 px · One colour · Reversed"): a concept in
one sentence from the name (Kesar: saffron); three different directions; no category cliché (hanger, needle, thread
spool); outlines only (no text element, raster, filter or stroke), at most two colours, padding; the mark readable at
16 and 32 px (a long wordmark brings a monogram); one colour; reversed on dark; contrast ≥ 3:1 on light and dark (our
rule; WCAG exempts logos); the blurred silhouette; distinct from each other and from famous marks. **Trademark:** the
agent cannot clear a mark and says so; the hand-over card links India's free search (tmrsearch.ipindia.gov.in, since
2026-07-01) for the name in the brand's classes.
