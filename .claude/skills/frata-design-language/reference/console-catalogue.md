# frata-design-language — Console: catalogue, products, import and offers

Part of `frata-design-language` (SKILL.md holds the rules every screen obeys: Rule 0, Words, tokens, feedback).
These sections are the owner-approved rules of one surface; they are moved here unchanged (practices plan G4).

## Contents

- Phase 1 console and website rules
- Product page and catalogue
- Products rework
- Import and order edit
- Offers

## Phase 1 console and website rules (owner-approved, 2026-11-06)

- **Settings**: one list of sections, each a page with ONE explicit save. An
  "Unsaved changes" bar (Save / Discard) appears on the first edit; leaving
  with changes asks "Leave without saving?" with "Keep editing". Never
  autosave what shoppers see or pay. Each page shows a live preview of the
  shop beside the form. A connect action (Razorpay keys) is a button that
  tests first, never a field the save bar saves.
- **Derived pages say where they come from**: policy pages, the Contact page,
  the footer and invoices read Settings; an edited policy stops following and
  says so. A "Ready for live payments" list names what is missing, each item a
  link to the page that fixes it.
- **Legal words**: a shop without a GSTIN prints "Bill of supply", never "Tax
  invoice". The grievance officer is shown wherever contacts are.
- **One primary action per record state** (order: Confirm → Mark packed →
  Print packing slip → none; refund due: Cancel and refund); everything else under "More". Destructive items in red, at
  the bottom of the menu.
- **Risk is a level with reasons and a next step** ("High risk · address is a
  landmark only · Call before confirming"), never a bare score.
- **Imports check before they write**: a summary (new, updated, left alone),
  every problem as row · column · reason in plain words, rows-to-fix as a
  file; a product with one bad row is left out whole. Imported products
  arrive hidden. An empty cell never clears a value unless asked.
- **Sign-up asks only what it uses now**: email (link and 6-digit code in one
  email), shop name (address derived live), pickup pincode, one optional
  question that changes what the merchant sees. A side panel on each step
  says what is not asked yet and where it will be.
- **The Frata website** marks every feature "Now" or "Next"; prices in rupees
  with "+ 18% GST"; the order fee "only on delivered orders". One primary
  action ("Start free"), no video hero, no chat widget at first paint; a
  WhatsApp link instead.
- **Motion**: 120 ms feedback, 200 ms small moves and exits, 320 ms sheets
  and drawers entering, nothing over 400 ms; a step moves in from the side it
  came from; changed or autofilled values flash once (`--duration-flash`);
  reduced motion fades instead (§ UX foundation rules 22–25a).

## Product page and catalogue (owner-approved, 2026-11-06)

- **Status and availability are two things, never one badge.** Status is who
  can FIND it, set by the merchant: Draft, Active (or Scheduled, with a
  moment), Unlisted (link only), Archived — its own card and its own action,
  not part of Save. Availability is whether a size and colour can be BOUGHT
  now, derived (`src/domains/catalogue/availability.ts`): In stock, Only N
  left (real stock, at 3 or fewer), Sold out, Pre-order · ships by <date>,
  Made to order · ships in N–M days. The merchant sets "When it runs out" per
  size and colour and reads "Shoppers see"; they never type an availability.
- **Product page order (Neel N2, as drawn)**: Photos; Name, price, description (the address line under it); Sizes and
  colours; Stock and prices (tabs: Price and stock · SKU and barcode; pick rows, then set); then one folded line each —
  Details, Size chart, Search and sharing, Tax, then the live extras (Video, The model, On the pack, Stories, Pairs). A
  folded line says what is set and ends in Add or Edit; a save's mistake inside opens it. Side, sticky on a wide screen:
  Status (Draft · Active · Unlisted, "Missing: …", Publish; what Google and Meta still need in one line), Shared on
  WhatsApp (from the draft, at the buy-box price), Category and Collections (tags under them). On a phone each colour is
  one summary row ("Gulabi · 6 sizes · ₹2,490 · 32 in stock") until opened.
- **The product's price is the one most sizes share** (`src/domains/catalogue/common-price.ts`), never a column: setting it
  writes to the sizes on it and the unpriced ones, fixed at the first keystroke, never a size priced on its own ("Sets 5
  of 6 · XXL has its own price"). Tax's gap check and the default description read the lowest price; the link card the
  buy box's.
- **Addresses are words** (`/console/products/linen-kurta-set`,
  `/products/linen-kurta-set` on the shop). Once a product has been live, a
  new address keeps the old one working as a redirect, and the field says so.
- **Swatches**: a circle cut from the product photo (prints) or a plain
  colour; the colour name is always written beside it, the chosen one has a
  ring (never colour alone), a colour sold out in the chosen size is crossed
  through but visible. The family ("Rani pink" files under Pink) is what
  filters and feeds read.
- **Categories come from the standard list** (Shopify's open taxonomy, pinned
  release), searched on the server; the category decides which details are
  asked, fields Google requires are marked "Google asks for this". Frata's
  additions for Indian crafts and fabrics are marked · and map to the nearest
  standard value.
- **Collections**: hand-picked (an order you set) or filled by rules (all or
  any) with a live "N products match now" count; a product shows the
  hand-picked ones as toggles and the rule-based ones it is in, in words.

## Products rework (owner-approved 2026-11-13; spec `docs/specs/2026-11-13-products-rework.md`, mockup https://claude.ai/artifact/NW8BozPHgfXQcUge2wKyv4)

Rules every products screen keeps (PR·0 built; PR·1–4 follow the mockup):
1. **A draft saves with what it has.** Blank prices save as none; only a live or Unlisted product refuses one, at its cell.
2. **Editing never loses work.** A chip renames in place and carries its cells, swatch and photos. A category change keeps the
   details that still apply. A field never silently reverts what was typed: it keeps it and says what is wrong.
3. **Fill, don't overwrite.** Bulk actions default to empty cells only, are off at 0, and say what they did ("Price set
   on 6 variants").
4. **Order the way shoppers read.** Known sizes go to their place (XS before S).
5. **A product starts from what it is.** Its kind and type come from its name (`src/domains/catalogue/kind.ts`) until PR·2's
   "What are you selling?" step. No match means no type, never the shop's first type.
6. **What shoppers see is said once.** The list's stock column comes from `bestOffer` (`src/domains/catalogue/availability.ts`):
   Pre-order, Made to order and Sold out, never "Sold out" for something that sells at 0. Unpriced sizes are counted
   ("2 without a price").
7. **Readiness names the gap.** "Size chart rows for 2–3 Y", not just "a size chart".
8. **The list scales.** Search by name or SKU, 50 a page, "Showing 1–50 of N" ("of 50+" while a search is on: no count of every match); past the last page goes to the last page.
9. **Duplicates are refused where they are made**: the field that holds the clash (a SKU, a barcode, a chip) is marked,
   not a toast alone.
10. **The list acts on many (PR·1).** Filters are tabs with counts (All, Active, Draft, Unlisted, Archived, Low stock),
    search covers name, SKU or a whole tag, Sort is a select, and every one of them is in the address. Selecting rows
    shows the bulk bar above the table: Set status ▾, Add to collection ▾, Duplicate (one), Archive, Delete. As in Work
    queues 7, bulk is a desktop tool, so a phone shows no checkboxes. Menus leave the bar while an action runs.
11. **Undo where it can be undone; ask where it can't.** Status changes, Archive and Duplicate show Undo for 8 s, and an
    Undo that can't put one back names it. Delete asks in a dialog (type the count for 5 or more). It deletes only what
    was never live, ordered or filmed. The rest is named, and Archive is offered for what isn't archived already.
12. **The editor (PR·2):** a new product starts from "What are you selling?" (Clothing with sizes · Footwear · Kids · One
    size; the name's guess until one is picked; "Create draft"). Sections in the order a brand works; a section with
    nothing saved folds to one line (`FoldSection`). The Save bar sits at the foot (`placement="bottom"`), Ctrl/⌘+S presses
    it, and toasts lift above it. Publish with unsaved changes says "Save and …" and does both.

## Import and order edit (owner-approved 2026-11-12; specs `docs/specs/2026-11-11-product-import.md`, `docs/specs/2026-11-11-order-edit.md`, mockup https://claude.ai/artifact/76HjNBCo2xdJyf6Qvwxutx)

- **A bulk write is file → check → write.** Steps in a strip (File, Check, Import); counts first (new, already
  there, left out); every problem as row · column · what to fix, with "Download rows to fix"; a preview of the first
  few as they will look; one primary action naming the count ("Import 58 as drafts"); the safe one names what stays
  ("Keep my shop as it is"). Imported products arrive as drafts. Done lists what each still needs, each with its button.
- **Photos in bulk are matched by file name** (SKU, address or name, a trailing number for order); an unmatched photo
  asks "Which product?" in place.
  As built (PI·2, 2026-11-12; `src/app/(console)/console/products/photos/`): "Add photos" from Done's Need photos tile
  (back: Import) and from Products' header, under More (back: Products); meta "N products need photos", one primary "Choose
  photos", the info callout with two example names from the shop's own products; empty: a drop area with the formats
  and "up to 500 at a time". One card: "126 photos · 37 products" + a warn "4 not matched"; cards as drawn (the file
  name on the photo; the product, then "Photo 2 of 3" or its colour; "Change"); a card that asks has a warn edge, its
  preview, and a search combobox named "Which product is IMG_4021.jpg", offering first the products a name fits when
  they are ≤ 3. Buttons: "Skip the N not matched" and "Add N photos" (only photos with a product and room). While
  sending: one bar for all, one per photo; each card ends "Added", "Not added" or "No room" (a product holds 10). A
  failed photo is ONE error toast (its words, "N photos added" under it, Try again); success one ok toast.
  Leaving while sending asks the browser's own "Leave site?".
- **Editing a placed order is in place, until packed.** Per line: the product's other sizes and colours as chips with
  what is left ("L · 2 left"; the original dashed; sold out crossed through), quantity − / +, Remove with a reason.
  "What changes" beside it, live: each change in words, an offer that now gives less, and the money (COD "Collect
  ₹6,016 → ₹5,207"; paid online: "Refund ₹1,899" with its timing and that the gateway keeps its fee, or "Collect ₹499 on
  delivery"). Save names the order and the money ("Save and refund ₹1,899"); the safe button keeps the order as it was.
  After: a toast with Undo, "Was M" on the line, the change in Activity.
  As built (OE·1, 2026-11-12; `src/app/(console)/console/orders/_components/edit/`): the editor replaces the Items card
  in place and loads its code only then; "Edit items" sits in the card's header, with "Undo the change" beside it while
  the edit can still be undone (10 minutes, before packing). Remove asks its reason as three chips on the line (Out of
  stock, Customer asked, Other; "Keep it"); a removed line is struck through with "Removed · out of stock" and "Put it
  back"; a piece added in the edit comes out without a reason. A line whose product was deleted says "No longer sold":
  no chips, no − / +, Remove only. A size already on the order is not offered again. A refusal (over the COD maximum,
  sold out, a reason missing) is one line in "What changes", in the error colour, and Save waits. The email tick shows
  only when the order has an email ("Email Ananya the new total"). Who sees "Edit items": owners and admins, until
  packed — never staff or a support visit; paid online too since OE·2, never while a change waits for the shopper.
  Activity says "emailed" only once the email went ("email waiting" while it is held for the Undo window). Phone: one column, the two buttons
  fixed above the bottom bar.
  As built (OE·2, paid online, 2026-11-12; `_components/edit/what-changes.tsx`, `paid-online.tsx`): "What changes" shows
  "Paid online ₹X" and "New total ₹Y" instead of "Collect on delivery"; lower → a warn callout "Refund ₹1,899 / Razorpay ·
  back in 5–10 working days · its fee isn't returned", Save "Save and refund ₹1,899", tick "Email Meera the refund", the
  toast "KS-1051 saved · refund ₹1,899 in 10 minutes" with Undo; higher → "Ask for ₹499 / The shopper pays first ·
  nothing changes until then", Save "Save and ask for ₹499", tick "… the payment link", the toast "KS-1051: waiting for
  ₹499 from the shopper" with no Undo (nothing changed). "Paid over 6 months ago: Razorpay can't refund it." is the
  refusal line, Save waits. While a change waits: the header's "Mark packed" becomes the status "Waiting for ₹499 from
  the shopper" (not a button), and the Items card holds one warn block — the changes, "New total", "Copy payment link"
  (the order's own page, for WhatsApp) and "Ship without the change". Refunds sit as rows under the money: "₹1,899 refund
  · sends at 10:52", "… · with Razorpay", "refunded · 5–10 working days to reach the shopper", or "Refund ₹1,899 not sent"
  with the cause on the next line and Try again (a failure after it is toast.error). Activity: "Asked for ₹499 · …", then
  "Paid ₹499 for the change · items changed" (Customer) or "Shipped without the change". The shopper's order page: a
  boxed "Pay ₹499 for the changes" with each change ("Linen co-ord: M → L"), "New total" and "Pay ₹499" (Razorpay on
  the shop's key); a refund is a line "Refund on its way · 5–10 working days" — never "refunded" (processed is not
  in their account yet).
  Rupees, never "a fee" (unit-economics review 2026-11-12), and a fee to the paisa: the refund callout says "Back in 5–10
  working days · Razorpay keeps its ₹70.80 fee" once the payment's fee is known (else "its fee isn't returned"; never a
  share of it, which would suggest part comes back); the cancel toast names the refund ("KS-1051 cancelled · refund ₹2,381
  in Razorpay"); the waiting box says
  "If they pay later, it's refunded and Razorpay keeps about ₹11.78."; a payment refunded in full says "· Razorpay kept
  ₹11.80" on its line. Try again shows only where it can work (never too old, already refunded, or settled by a later
  change). The cancel dialog names what the payments still hold, and what is already refunded or on its way.

## Offers (owner-approved 2026-11-08; spec `docs/specs/2026-11-08-coupons.md`, mockup https://claude.ai/artifact/HVFMBJzJoH9tTUh9d1zxHT)

45. **Save, never surcharge.** "Pay online, save ₹50" on the pay-online card and "No ₹50 online
    saving" on the COD card; never "COD costs ₹50 more". Every fee shown before the shopper commits.
46. **The best offer is applied for the shopper.** Checkout lists the shop's offers (applied, or
    what each needs: "Add ₹300 more"); "Have a code?" stays behind a link (Baymard, Jun 2026).
47. **One answer for a code that does not apply**, whether it exists or not: "this code doesn't
    work here". Unlisted codes never appear in a list. One exception (shopper batch 2026-11-12, owner to confirm): a
    real code that would save on this bag but is beaten by a better offer of its class reads "a better offer is
    already applied" (`'beaten'`), and is no wrong guess.
48. **Real ends only.** The bar shows "till 30 Nov" only when the offer has an end; never a
    countdown, never one that restarts per visit (CCPA dark-pattern rules).
49. **Each saving is named** in the bag, checkout, the order page and the invoice; the invoice
    shows value and discount before GST at the line's rate.
50. **The console judges offers on delivered orders:** uses, ₹ given, delivered, ₹ kept per order
    after returns (Analytics' figure: "Delivered, came back or lost · before ads and packaging", with how many were
    left out); a form warns when an offer would mostly reward orders that already qualify.
    Partners draft; owners and admins start, pause and end (ending confirms; it is final). ₹ kept is a profit, so a
    cost: whoever `seesCosts` (owners and admins; a partner only before handover, owner 2026-11-08; never staff);
    beside it, "Shipping
    estimated" or "Before shipping costs (returns count once they are set)" (with a link to set them) whenever freight is not the courier's actual charge.
51. **"Did it make money?" reads a window and says when it is too few** (O·3): the Offers list's strip and an offer's
    page show the last 30 days against the shop's orders without an offer; under 30 orders they say "too few to
    judge" before any number. A creator code flagged "Leak?" says which rule and names the remedy (end the offer);
    it never acts by itself.
52. **Stopped by Frrata** is a danger badge and a line with Frrata's own reason; the shop's only action is End.
