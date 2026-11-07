# UX foundation research: brand, colour, motion, one shell (2026-11-07)

For `docs/specs/2026-11-07-ux-foundation.md`. **Current sources only**
(frata-planning § Step 2): every source below was published or updated between
2025-11-07 and 2026-11-07, and the date given is the page's own date (or the npm
or GitHub publish time). A point without such a source says **no current source
found** and is treated as unverified.

## Verdicts

1. **Keep the split: ink is interaction, oxblood is the mark.** Razorpay Blade
   12.131.0 gave its primary Button a neutral colour separate from the brand
   (2026-11-06). Vercel Geist uses a near-black primary action (page undated,
   unverified).
2. **Fix contrast at the token layer and gate it.** Atlassian reworked its
   tokens so borders and focus rings reach ≥ 3:1 in both themes (2026-02-03).
   WCAG 3 is still a Working Draft with no contrast method chosen (W3C
   2026-03-03; Roselli 2026-04-10, updated 04-13), so the bar is **WCAG 2.2 AA**:
   4.5:1 for text, 3:1 for controls and focus.
3. **Distinguish surfaces by chrome only.** Shopify's new admin has a dark side
   nav (2026-09-24), and Linear dims its sidebar (2026-03-12). In both, the
   content tokens stay the same. Frata Admin keeps its ink frame, and status
   colours never change between surfaces.
4. **Remove decoration, not density.** Shopify "de-layers" its containers
   (2026-09-24). Linear uses fewer and smaller monochrome icons, fewer
   separators, and warm greys at low chroma, warning that "too warm risks
   looking muddy" (2026-03-12).
5. **Build home from the work.** Shiprocket rebuilt its dashboard around
   "where are my shipments, what's at risk, where am I losing money", with one
   click to act (2026-08-24). Smashing says every visualisation should imply a
   next step (2026-08-26).
6. **Animate with CSS only, inside the existing tokens.** `@starting-style` and
   `transition-behavior: allow-discrete` are Baseline 2024 (MDN modified
   2026-04-20). Safari 26.4 fixed entry animations that ran only once
   (2026-03-24).
7. **No page transitions yet.** React 19.3 made `<ViewTransition>` stable
   (react.dev 2026-09-09), and Next.js documents it for the App Router with no
   configuration (nextjs.org, lastUpdated 2026-10-15). Frata runs Next 15.5 and
   React 19.2 (`package.json`), so the feature waits for that upgrade. When it
   comes, follow the Next guide: `::view-transition { pointer-events: none }`,
   an anchored header, and 0 s under reduced motion.

## Products, with "Taken"

| Product · date | What changed | Taken |
|---|---|---|
| Shopify admin · 2026-09-15 (shopify.dev changelog "prepare your app for the admin's new look"), 2026-09-24 (shopify.com/blog/admin-new-look) | New colour, type, spacing and icons "inside a new frame". Collapsible side nav holding search, notifications and the store picker. Fewer nested containers. Polaris 2.0 is a release candidate, with apps opting in by 2027-05-01. Palette and font values are not published. | One frame, no cards inside cards, account block in the nav |
| Linear · 2026-03-12 (linear.app/now/behind-the-latest-design-refresh, changelog) | Warmer and less saturated greys, dimmed sidebar, compact tabs, fewer borders, header actions in the same place everywhere, tokens tuned in hue, chroma and lightness. Shipped behind a flag with an on/off toolbar. | Warm stone at low chroma; 16 px monochrome icons |
| Razorpay Blade · 12.131.0, 2026-11-06 (github.com/razorpay/blade/releases) | Neutral primary Button; focus ring is a 4 px outline with a 1 px gap. RazorSense design language (razorpay.com/razorsense, undated, unverified). | Ink primary confirmed |
| Atlassian · 2026-02-03 (itbrief.com.au, "Atlassian embeds accessibility in design system work") | Tokens reach contrast in light and dark while keeping brand hierarchy; borders and focus rings ≥ 3:1. Atlassian Sans and Mono derive from Inter and JetBrains Mono (2025-04-10, outside the window, unverified). | Field edge 3:1; `check:contrast` |
| GitHub Primer primitives · 11.6.0 2026-03-25, 11.8.0 2026-05-08, 11.10.0 2026-07-30 (CHANGELOG) | Mona Sans became primary; functional motion and spacing tokens; two statuses separated in the protanopia and deuteranopia themes; Noto Sans fixed in the font stacks. | Status = word + mark; colour-blind check |
| Freshworks Dew · 2025-11-24 (freshworks.com/theworks) | One system for every product: calm palette, WCAG 2.2 AA, light, dark and custom themes; AI surfaces made to feel native. | Dark tokens ready |
| Zoho One · 2025-11-20 (cio.com) | Organised by work ("Spaces", an Action Panel) instead of by app. | Nav grouped by job (kept) |
| Shiprocket seller dashboard · 2026-08-24 (shiprocket.in/blog/product-highlights-from-august-2026) | Four views; NDR and RTO breakdowns; one-click auto-block; "One screen to spot the leak – and act on it the same day." | U4 "Today" home |
| Stripe Sessions · 2026-04-29 (stripe.com/blog) | No visual redesign. A Dashboard assistant explains numbers; the Console preview asks for confirmation before consequential actions. | Reason beside the number; AI is out of scope |
| Bitbucket nav · 2026-01-22 (atlassian.com/blog/bitbucket) | Opt-in, then switched over with a way back, then removed (22 Jan → 10 Feb → 26 Feb). | A way back once there are live merchants |

No company published measured outcomes of a redesign in the window.

## Colour

- OKLCH ramps: Tailwind 4.2.0 added four subtle OKLCH neutral palettes:
  mauve, olive, mist and taupe (2026-02-18). The current Tailwind is 4.3.5
  (2026-11-06).
- Step roles (backgrounds → component states → borders → solids → text):
  Geist's 10 × 10 scales (vercel.com/geist/colors, undated, unverified). Radix:
  **no current source found** (last release 2023).
- Charts (Phase 3, not now): Primer's data-visualisation guidance (undated,
  unverified) sets marks at ≥ 3:1 and labels at ≥ 4.5:1, at most 5 series, the
  second and later lines dashed, never colour alone. Okabe-Ito and Paul Tol:
  **no current source found**.

## Type

- Inter 4.1 is still the latest (released 2024-11-16; page checked
  2026-11-07). Fontsource's Inter 4.001 (2026-03-03) has `opsz` 14–32, and
  **covers Latin and Cyrillic only, no Devanagari**.
- Noto Sans Devanagari v2.007 is variable (`wght`, `wdth`), OFL (Fontsource
  2026-09-09). Primer fixed Noto Sans in its stacks (2026-07-30).
- `font-variant-numeric: tabular-nums` is Baseline "widely available" (MDN
  modified 2026-09-10). Geist Mono moved ligatures off by default (1.7.0,
  2026-02-06). Turn ligatures off for order numbers in any mono.
- Devanagari line height 1.8 (UX4G, © 2026, page undated, partly unverified).

## Motion and platform

- View Transitions, same-document: Baseline via Interop 2025; Interop 2026
  adds cross-document (web.dev 2026-02-12; WebKit 2026-02-12). Cross-document
  support (caniuse, read 2026-11-07): Chrome 126+, Safari 18.2+, Firefox
  partial, Samsung Internet not supported.
- React 19.3 `<ViewTransition>` animates only Transitions, Suspense reveals and
  `useDeferredValue` (react.dev 2026-09-09). The Next.js guide's example
  timings are 150 ms exit, 210 ms enter and 400 ms move (2026-10-15).
- Scroll-driven animations: Baseline once Firefox 159 turned them on by default
  (web.dev, Oct 2026). Not needed.
- Material 3 Expressive `MotionScheme.standard()` is "for utilitarian UI…
  recurring interactions" (Android reference, undated, unverified). A web
  spring spec: **no current source found**. We keep non-bouncy easing.
- Performance: CrUX measures INP per soft navigation (experimental), which
  roughly doubles the Android pass rate for single-page apps; heavy JavaScript
  on navigation still costs INP (web.dev 2026-10-13). INP thresholds: web.dev
  2025-09-02, outside the window, unverified.

## UX research

- NN/g, contextual menus (2025-11-28): with one or two actions, show them
  directly; overflow for secondary actions only, visible without hover,
  keyboard-operable, never labelled "Options".
- NN/g, info tips (2026-01-23): constraints and anything a decision needs go
  inline; tips are nice-to-know detail most people never open.
- NN/g, State of UX 2026 (2026-01-16): "the year of AI fatigue"; AI should
  recede. NN/g PACED disclosure (2026-09-25).
- NN/g, notifications (2026-02-20): reactive, proactive and optimisation tiers;
  each alert says what happened, what to do and by when, and clears once
  resolved (for Phase 2's inbox).
- Smashing, dashboards (2026-08-26): a "density dial" for each audience, one
  colour mapping everywhere, the aggregate first.
- WCAG 2.2 checklist (adacompliancepros.com 2026-07-27): reflow at 320 CSS px
  (= 1280 px at 400 %); targets ≥ 24 × 24; a sticky bar never fully hides the
  focused element; text-spacing override (line height 1.5, paragraph spacing
  2, letter spacing 0.12, word spacing 0.16).
- Forced colours: `box-shadow` becomes none and colours follow native element
  semantics (MDN 2026-04-20).
- `Intl.NumberFormat('en-IN')` groups lakh and crore (MDN 2026-08-21). Check
  compact crore output on a device.
- **No current source found:** bottom nav vs a menu button, command palettes for
  non-technical users, toast duration and undo, empty-state illustration,
  onboarding checklists, sticky table headers and bulk patterns. Where the
  spec decides these, it says the decision is our judgement.

## What the codebase already has (searched 2026-11-07)

Tokens in `src/app/globals.css`, checked by `check:hex`. Motion tokens and
three keyframes. `Badge`, `Button`, `Panel`, `Notice`, `SaveBar`/`LeaveDialog`,
`DataTable`, `Money`/`Numeric`, and `PageHeader`. Two navs (`console-nav.tsx`
and `admin-nav.tsx`), with no shared shell. `lucide-react` is installed but has
no imports. No progress bar, skip link, live region, dark tokens, `Section`,
`SearchField` or `Pager`. 1D·3 plans `InfoTip`, `Dialog`, `Menu`, `Tabs`,
`Toast` and `KeySheet`.
