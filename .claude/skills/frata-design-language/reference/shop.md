# frata-design-language — The shop: storefront, themes, EkCode and share cards

Part of `frata-design-language` (SKILL.md holds the rules every screen obeys: Rule 0, Words, tokens, feedback).
These sections are the owner-approved rules of one surface; they are moved here unchanged (practices plan G4).

## Contents

- Storefront as built
- Storefront
- Shop themes
- Theme Studio
- Theme Signal
- Checkout and order pages on a code-site store
- EkCode
- Share cards

## Storefront as built (1B, 2026-11-07)

- Views in `src/components/storefront/` are the ONE rendering of a shop: the
  shop pages, `/console/preview` and Settings' previews all use them.
- Product page order: gallery (chosen colour's photos first) → title → price
  (the prior price struck only after a real cut in the last 30 days, "Save ₹N", never a
  percentage; M.R.P. on its own line, never struck) → colour, then size →
  "Shoppers see" line for the choice → Add to bag (never greyed out; "Pick a
  size.") → Pay on delivery, delivery charge, dispatch and arrival days, the
  return window → description → details → the model.
- Cards: 4:5 cover, second photo on hover (pointer devices only), name, "From
  ₹" when prices differ, every colour as a small swatch, one tag at most.
- Before a shop opens every page but the policies is "Opening soon".

## Storefront

- Each merchant's shop wears its published theme (§ Shop themes: the `--store-*` tokens) under
  `data-store-theme`; never hard-coded per page.
- Editorial, type-led, large imagery, few colours. Indian shopper conventions
  built in: pincode delivery check, "Pay on delivery" badge, size chart and
  "find my size", the return window in words, WhatsApp order updates.
- Phone first, touch targets ≥ 44px. Photos from the 1A ladder (400–1600 WebP)
  through `srcSet`/`sizes` (`src/components/storefront/photo.tsx`), the largest
  paint eager with `fetchpriority=high`, the rest lazy; no `next/image` optimiser.
  At most 2 images a page are `priority` (P15; TS1b: `ProductGrid` is off unless its caller opens the page; a lead
  design's photo ≤ 1). A card's cover has empty `alt` (its title names the link); its hover photo has one `src`. No shop
  font is preloaded (P6). A photo that has not painted, or never will, shows the
  shop's chip tile with a small garment drawn on it — never the browser's
  broken-image glyph or its alt text (`img[data-photo]`).
- **Shop motion** uses the console's tokens under the theme's `data-motion`
  (`none` stops it): Add to bag answers in 120 ms (a 0.97 press) and the bag's
  count hops on the snap curve; the bag and the size guide are
  `data-store-drawer` (rule 25a). A list longer than 48 is paged at its own
  addresses (`/products/page/N`), each cached on its own.
- Checkout: one page, at most 7 fields, phone first, pincode fills city and
  state, labels above fields. Shopper sign-in is EkCode only (§ EkCode; no SMS OTP);
  COD rules and the To confirm queue carry the risk. No merchant cost ever
  reaches this surface (ADR-0003).
- **Sizes are buttons**, sold-out shown and still readable; Add to bag stays
  usable and points at the missing size instead of greying out. Size guide is
  a sheet the phone's Back closes, in cm and inches, with the model's height.
- **Pincode answers as the sixth digit lands** (COD or not, and why) — deferred
  by the owner 2026-11-06; until it returns in 1C the product page says delivery
  days in words. When it comes, it is on the
  product page, before the bag.
- **Every charge is a line before ordering** (CCPA dark-pattern guidelines,
  2023): shipping, the COD fee. A total that changes says so ("Price updated
  to ₹2,690") before payment, never after.
- A failed payment returns to a filled form, never an empty one.
- **Keyboard and screen readers, every theme** (search and sharing S2·7): "Skip to content" is the first Tab stop
  (the shop's language), the focus ring is 2 px in the shop's own ink (`[data-store-theme] :focus-visible`), and
  every control is ≥ 24 px — e2e 90-ux measures five shop pages at every width, so a theme that breaks one fails.
- **Search and sharing for a collection** is the product's panel (`SeoPanel folder="collections"`), closed by
  default; its address stays under the name, and a changed address says the old one will send shoppers here.
- **Barcode** is an optional column after SKU in the variant grid, digits only; it is never asked for.

## Shop themes (approved mockups 2026-11-08, T0–T2 built)

- The storefront's `--store-*` tokens now come from the shop's theme (`schemeVars(theme, scheme)` on the shell and
  on any section painted in another scheme). Never hard-code a store colour in a component.
- Themes are presets over one section library; a new look is a manifest, a new capability is a section.
- Promise and trust words come from shop facts, never typed claims; a section with nothing to show renders nothing.
- The customizer and Look follow the T1 mockup (https://claude.ai/artifact/9QRkdHHKLAwpj5LmcxYYSU): phone preview
  first, one primary action (Customize / Publish), autosave states, Undo/Redo, counters for limits.
- Storefront tokens a component may read: `--store-bg/text/sub/line/chip/accent/button/on-button/sale/good/bad`,
  `--store-display`, `--store-radius`, `--store-ratio` (photo shape), `--store-cols` (phone columns),
  `--store-h-scale`, `--store-space`. Buttons carry `store-btn` (Outline buttons follow `data-buttons`), a second
  photo on hover `store-hover` (off with `data-hover="off"`); motion obeys `data-motion`.
- Customizer patterns: every change is one Undo step and an autosave 800 ms later ("Saving…" / "Saved" / "Not saved"
  in a `role=status`); a stale draft says who changed it and offers Reload; move up/down buttons beside drag; Add a
  section is the searchable library (Look v3 below); a section that blocks Publish says "needs you" in the list;
  Publish is the one-line confirm, Going live, then the popup over the shop (Look v3 below); a partner or staff sees
  "Ask the owner to publish"; support sees but can't change.
- Pages beyond Home (T2 mockup https://claude.ai/artifact/H9wfYHs6Uq3Vod7rbRvHsM): the customizer's page picker
  opens that page's panel (Product page: photos swipe/with thumbnails, About and details open/folded; Collection
  page: title/banner); cards (standard/centred/framed) and computer columns (4/3) apply to every grid. One tag per
  card: availability first, an offer's badge only where none shows.
- A Hindi shop: `lang="hi"` on the shop, Noto Sans Devanagari after Inter; the shop's own words change, what the
  merchant typed never does. Hindi words get a fluent reader's review before a Hindi shop goes live.
- Theme versions (T3): Look tells the merchant in words, never a status code — an update is ready (and that nothing
  changes until they publish), Frrata recalled the version they're on (with one tap to restore the previous look),
  or withdrew it (their previous look is live, nothing lost). Admin › Themes says every decision is final and names
  the shops it touches; a destructive decision is a red-labelled form with a required reason, not a typed phrase.
- Colours and type live in Look only; Settings › Store details keeps the logo and tagline and previews them in the published look.
- **Three themes, each a job** (owner, 2026-11-08 night; plan `docs/plans/2026-11-09-themes-three.md`):
  **Editorial** — occasion and designer wear: photos stacked large beside a buy box that stays, Cormorant, square,
  a sheen on buttons, photos that grow, pages that fade in, sections that rise, statement footer in ink, focused
  checkout. **Bazaar** — big catalogues and sales: circles, bottom tabs, three across, framed cards that lift,
  thumbnails under the photo, pill buttons that press, a phone Add to bag bar, tinted footer. **Studio** —
  contemporary and basics: split header, uppercase Inter, underlined buttons, two photos across beside a buy box
  that stays, pages that rise, statement footer in black, focused checkout. A new look is a new value a theme
  offers, never a fourth theme without a new job.
- **A theme offers its own choices**; the customizer shows a choice only when the theme offers two or more values
  (one value is no choice). Names merchants read: Photos (Two across, Stacked, Thumbnails under, Thumbnails beside);
  Buttons Style (Solid, Outline, Underlined), Shape (Follows corners, Pill), On hover (Press, Lift, Sheen); Cards on
  hover (Still, Lift, Zoom photo); Pages arrive (At once, Fade, Rise); Checkout (With your menu, Focused).
- **2.0 motion**: transform and opacity only; hover motion inside `(hover: hover)`; a page arrives from opacity 0.6
  (never 0, so the largest paint isn't held), ending on no transform; sections rise with a scroll timeline, never
  the first; `Motion: None` and reduced motion stop all of it. Add to bag stays a filled button in every style.
- **Legal lines never leave**: Statement and the focused checkout keep the policies, legal name, address and
  grievance officer.
- **Sample pieces** fill the customizer's preview of an empty shop, tagged "Sample", drawn (never photographed), and
  never reach a shop; a photo section still needs the merchant's own photo to publish.
- **Look v3** (owner-approved 2026-11-09, mockup https://claude.ai/artifact/N3ATeKr1XxgTvEiPLjN2tq):
  **Frrata Themes** is the tile lockup (`<ThemesLockup>`: monogram + "themes", "by Frrata" under it; `size="sm"` is
  the card badge), never "by Frrata" in words. The preview opens on a **computer**, the shop drawn at 1280 px and
  scaled to fit in a browser frame with the shop's address; Phone is one tap. **Publish is a small confirm** under the
  button (one line, no list of changes; only what blocks it, each with Fix), then the preview says **Going live**
  (a sweep and the header's rani line filling, held ≥ 1.3 s), then a popup over the live shop: its address (Copy),
  Undo, Keep editing, View your shop (a new tab). Never a page of its own.
- **Confirm what loses work or changes the shop**: Discard draft, Undo last publish ("Put Classic back on your
  shop?"), Restore over an open draft, Try a theme over another theme's draft, leaving the customizer before a save
  lands. Removing a section is a toast with Undo, not a dialog; hide, move and style changes ask nothing.
- **Style panel**: groups that open and close, each saying what it is set to; colour styles as colour bars with a
  check; brand colour as swatches plus Any colour; buttons as real buttons that show their hover; header, footer and
  photo layouts as pictures; up to four short choices as a sliding segmented control (`Segmented`).
- **A photo field**: drop, paste or choose, or one of the shop's product photos; the photo shows at once under a
  progress ring while it uploads; tap it to set the point it keeps in view; replace and remove on the photo;
  description suggestions; a failure says what to do (an iPhone HEIC says how to share it as a JPEG).
- **Section library**: search by name, words and tags (`/`), kinds with counts, picture cards, "Fits <theme>" on by
  default, "Made for <theme>" first, a full section greyed with its limit, "Adds below <section>".
- **Look v4** (owner-approved 2026-11-09, mockup https://claude.ai/artifact/MmC6BnAps1XXSWyfy7PfSL): three layers,
  shown apart — **Site settings** behind the gear ("Site" at the top of the panel: Colours, Text styles, Icons,
  Brand), **Style** (the theme's own choices), **page options** (each page in the page picker: Home, a product, a
  collection, Shop all, Bag, Checkout; "Editing: <page>"; opening Style › Products opens a collection). Bag and
  Checkout are one layout for every theme (money pages), styled by Site settings. A palette is checked as it is
  picked ("Reads well" or why, never saved unreadable). The panel folds to a rail of icons on a computer.
  **Shop icons**: Line (Lucide), Duotone, Solid (Phosphor), one stroke (Thin 1, Regular 1.5, Bold 2), inline SVG,
  `currentColor`; an icon sits beside words in menus and tabs, never instead of them (the bag in the header is the
  one icon alone: its name and count are its label). No text glyph as an icon (≡ is gone). **Menus**: Main (3
  levels), Footer (1), Phone tabs (≤ 5, each an icon); moved by Up, Down, Under the one above, Out a level (thumb
  first); every level that opens starts with "View all"; soft warnings past 7 top items or 10 under one.
- **Even rhythm** (2.0 themes): the same space above and below every section but a full-bleed one. Horizontal rails
  snap to their padding (`scroll-px-4`), never past it.

## Theme Studio (owner-approved 2026-11-11; spec `docs/specs/2026-11-11-theme-studio.md`, mockup https://claude.ai/artifact/3Mpvh9zHQF6P4kJBihkmTd)

- **Who builds:** Frrata staff in Admin (ink frame, STAFF tag, "Submit for review"); partners in their portal (their
  name as the tag, "Release to my clients"). Owners never build structure: in Look they fill fields, reorder, hide and
  add the theme's designs and pages.
- **The studio is desktop-only** ("Open the studio on a computer" on a phone); Look stays phone-first.
- **Layout:** top bar (theme · version chip, page picker, Design system, Computer / Phone, Checks count, Undo / Redo,
  the one primary action); left the layers tree (indent per level, ↑ ↓ and ⋯ on hover or selection, "+ Add a block" with
  `/`, the limit as a count); centre the preview on sample pieces (the selected section outlined in the shop's accent
  with its name); right the block's settings and **Owner fills** (which fields the owner edits).
- **Block picker** is the section library's pattern: search, kinds with counts, presets as picture cards; a block at
  its limit is greyed with the count ("100 of 100 blocks on this page").
- **Checks** are a count chip in the top bar (amber "2 to fix" → green "Checks pass"); each failing check is one line
  with a one-tap Fix that names the result ("Use #5A5A55").
- **Design system:** colours by role (Paper, Tint, Ink, Accent, Sale), each with its hex in mono and a chip ("Reads
  well" or the ratio); every other choice a segmented control of Frrata's values. Never a free CSS value.
- **Releasing:** staff Submit (frozen version, notes) → another staff member approves ("Approve Monsoon 1.0.0") →
  Admin › Themes as today. A partner chooses **which clients** get a version (checkbox per client, "Release to Kesar
  Studio"); a theme is never offered to a client the partner didn't pick.
- **Owners:** "Made for you · <partner>" first in Look's themes; "Update ready" as a banner with Try it in a draft;
  pages in the page picker with "+ Add a page".
- **Pages:** About (origin, makers, materials); Contact = "Chat on WhatsApp" to the shop's number + the business
  details from Settings (can't be removed; a form comes with the Messages inbox); FAQ answers follow Settings.
- **States:** no themes yet (pictogram + New theme); limit reached; waiting for review (Withdraw submission); withdrawn
  by Frrata (reason + Reply); partner removed ("No more updates", the look stays); partner paused by Frrata.
- **Designs in Look (TS0b, board https://claude.ai/artifact/DzD84DZsW6eGYQ6QkfJbM4 v2, approved 2026-11-11):** first in
  Add a section as **Designs**, each a picture drawn from its own blocks with "Made for <theme>"; at the page's limit the
  card greys with the count. A design's form lists only the fields the theme marks, in page order, with the theme's
  labels; questions have ↑ ↓ and Remove beside each item and "Add a question" up to 12.
- **Example words never reach a shop:** words that make a claim (how a piece is made, size answers) start as greyed
  placeholders marked **Example** with "Write your own"; Publish names each one still to write. A theme's photo is a
  sample: shown greyed in the customizer's preview only; on the shop an unfilled photo leaves its block out.
- **A drop is a date, never a ticking count** (rule 48): "Drops Fri 14 Nov, 7 pm", hidden once passed.
- **Pages in Look (TS1a, board https://claude.ai/artifact/X2TEDZRd7FyYvbiM6h6Jno v2, approved 2026-11-11):** the page
  picker's **Pages** group: Contact (always, at /policies/contact), each page by title, "Add a page…" (About, FAQ: one;
  pictures drawn from their blocks; the count of 20). What comes from Settings is a read-only box headed "From your
  Settings" with **Change in Settings**, never a field. An FAQ answer from Settings carries a "From your settings" chip.
  A page's address is set while it is a draft and fixed once published; Hide and Remove take effect at Publish.

## Theme Signal (owner-approved 2026-11-09; spec `docs/specs/2026-11-09-theme-signal.md`, mockup https://claude.ai/artifact/9XNT3KFJziXEyaKyDa48dr)
- **One signal colour as a system:** the merchant's accent is used for section labels (pills), one full-bleed band and
  focus/selection, never for body text or large fills elsewhere; checked readable with `brandColourProblem`.
- **A grotesk voice** (Schibsted Grotesk for headings, labels, buttons and prices; body Inter, the shops' body face);
  headings in sentence case, short, may end with a full stop;
  uppercase only for labels and buttons, with letter-spacing.
- **Products on grey tiles**, edge-to-edge with 2 px gutters; the name left, the price right, under the photo.
- **Floating header:** a dark panel at the top left on a computer, a dark rounded bar on a phone, over the hero; solid
  once scrolled.
- **Rails say where you are:** a thin progress line and "01 / 10"; tabs are pill segments (`aria-pressed`), swipeable.
- **Video in a section** (console): empty (Add a video · or Use a photo), uploading (progress, Cancel), getting ready,
  ready (poster, length, Replace, Remove), didn't work (Choose another); a loop plays muted, only in view, never with
  sound or a player bar on the shop. TS1b (owner 2026-11-11): a loop loads after 400 ms at half in view, one at a time;
  a Home plays at most 3 (at 3, a loop field says "A Home plays at most 3 videos."); loops play a 720p MP4 at most.
- **Designs that sell (TS1b):** a design draws what its board draws (a grid of 4, tiles ≤ 4, one featured piece); the
  library greys a design with pieces or collections once 2 are on the page, saying why. A drop date reads "Drops Sat 14
  Nov, 7 pm" (`dropLineIN`, India time; never a ticking count) and is left out once passed.
- **Theme samples:** realistic photos only (credited in `public/themes/samples/*/CREDITS.json`); the merchant's own
  pieces always first.
- **Story half (1.2, S2):** a Spotlight is Image with text on the tile, words .8fr beside a 2:1 photo or loop; a Story
  fan is 3–7 cards, the middle forward, side cards' photos softened (titles stay full contrast), a swipe row on a phone,
  side by side under reduced motion, a focused card brought forward; a Statement is a full-bleed photo under a ≥ 60 %
  scrim, a small uppercase line and a handwritten wordmark. **One script face (Caveat), used only for a handwritten
  line** (the Hero's, the Statement's), tilted −4° / −6°, never for body or buttons. Section headings 22–34 px, 600,
  −0.02em, balanced. An empty story section shows nothing; it never stops a publish.

## Checkout and order pages on a code-site store (owner-approved mockups P2 and P3, 2026-11-16; `docs/mockups/2026-11-16-p2-checkout.html`, `docs/mockups/2026-11-16-p3-secure-frame.html`)

- **They draw the brand record** (Console › Brand: logo, colours, fonts, corners, spacing), never the theme: checkout,
  the bag-link page, order pages and policy pages. A theme shop keeps its theme until it moves to code.
- **What a partner may set**, in Console › Brand › Checkout, and nothing more:
  - **Header:** the logo left or centred; the back link "Back to <store>" on or off.
  - **Footer:** policy links in one row or two. The legal block always shows.
  - **Trust blocks:** up to four, in the partner's order, from a closed set worded from the store's own settings
    (delivery days, the exchange or returns window, Pay on delivery's limit, secure payment by Razorpay, a GST invoice on
    every order). Never typed words.
  - **Two plain lines:** the checkout heading, ≤ 24 characters (empty draws "Checkout"), and the order page's thank-you
    line, ≤ 120 (empty draws nothing). Each shows its counter ("12/24") and refuses a UPI ID, a phone number, a link and
    a run of 6 or more digits, **each refusal at the field** ("This line has a UPI ID. Remove it to save."), checked as
    typed and again on Save; what was typed stays; Save's error toast counts the lines ("2 lines need fixing" · Show).
- **Everything else is Frrata's only, with no setting:** fields and their labels, the steps and their order, prices,
  payment and the pay button's words, consent and privacy words, the legal block. No partner pixel or script on these
  pages.
- **Who sets it:** the owner, a Manager, the partner's owner and Leads. On an open store a partner's save waits for the
  owner (chip "Waiting for the owner", toast "Sent to the owner."); a Builder reads the tab as facts beside the preview
  ("Preview only"). The preview uses the store's own products as sample data.
- **Layout:** one 560 px column on a computer, as on a phone. On one address the secure frame sits inside that column,
  under Your bag and How you'll pay, with no edge of its own; the trust line stays under Place order.
- **Lines:** − and + (1 to 10) and Remove on each; − at 1 removes the line with "Removed <product>. · Undo" in its place; a
  sold-out line shows Sold out with Remove.
- **The button** names the amount the server priced: "Place order · ₹<amount>" on delivery, "Pay · ₹<amount>" online.
  The frame's own states: "Loading the secure form"; "We couldn't load the secure form." with Try again.
- **The bag-link page:** the logo and "Opening checkout" for under a second; no footer.

## EkCode (owner-approved 2026-11-09; spec `docs/specs/2026-11-09-shopper-login.md`, mockup https://claude.ai/artifact/A33Xi8HVfsAyZqQ2pn7uKu)

- **A brand of its own.** Nothing a shopper sees names Frrata: ekcode.in pages, the notice, WhatsApp (sender
  "EkCode"), email, checkout lines. Merchants meet it as an app in the console.
- **The mark** is drawn, never typed: एक inside one rounded code box with a rani cursor under it, "Code" open beside
  it, Mukta 700 for both scripts. The box alone (filled ink below 48 px; ए alone at 16 px) is the icon. Devanagari
  appears only in the mark: **every word on every screen is English** until the owner plans other languages.
- **The shop's button** is "Continue with" + the mark, ink on light themes and paper on dark, 52 px, full width on a
  phone, never in the shop's colours, above the guest form with an "or" divider. Guest checkout always stays.
- **ekcode.in screens**: a real page on ekcode.in, **never an iframe** (a popup or a new tab is allowed: checkout's
  secure frame opens it in a popup, owner 2026-11-16); the shop's name and initial top right;
  one field per screen; the number checks itself as typed (10 digits, 6–9); the code field is `one-time-code`, fills
  itself and submits on the sixth digit (no Verify button); "Open WhatsApp" on a phone; email offered only when
  needed; consent is its own tap, never pre-ticked; the shopper sees exactly what the shop gets and picks the
  address; "Not you?" is one tap everywhere; footer Privacy · Terms only.
- **Limits are allowances, never charges** (owner): an order-update meter on the Apps row (amber at 80%); past it,
  "More updates" offers wait until the 1st, move up a plan, or connect your own number.
- **EkCode's colours** are tokens in `src/app/base.css`, the same in both modes and on every shop theme: `--ek-ink`
  (#1C1917) and `--ek-paper` (#FAFAF9) — 17:1 —, `--ek-cursor` (rani, on paper) and `--ek-cursor-on-ink`, `--ek-sub`,
  `--ek-line` (decorative). The mark is `src/components/ekcode/mark.tsx`, drawn from `mark-paths.ts`.
- **Admin › EkCode** shows counts, costs and health, never a list of shoppers or an address; the one way in is "Find
  an account" by exact number with a reason, logged.

## Share cards (search and sharing S1, owner-approved mockup 2026-11-09)

What a link to a shop page shows in WhatsApp, Instagram DMs, Facebook, X, iMessage and Telegram. Drawn by
`src/lib/seo/render-card.tsx`; what each shows is `src/lib/seo/card.ts`.
- **1200×630 JPEG, ≤ 300 KB** (WhatsApp drops larger; JPEG is the only format every app documents). One per page
  version: an edit is a new address.
- **Product**: the photo fills the card; one dark band — shop name, "Pay on delivery" when COD is on, the price in
  large digits; a recent cut struck beside it as the buy box (`compareAt`; the tag's M.R.P. is not drawn); "Sold out"
  replaces the price. **Collection**: one large photo with the name and "From ₹… · N styles", three small. **Shop**
  (also lists and policies): the name on the theme's tint, its promises, three photos. No photo: name, shop, price.
- **Few words, no Devanagari drawn** (Satori cannot shape it; Hindi goes in og:title and og:description). Apple: avoid
  text-heavy images. og:image:alt describes the photo, not a caption.
