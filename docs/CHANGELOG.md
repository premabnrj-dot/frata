# Changelog

What a merchant (or Frata staff) can do now that they could not before, newest first. One entry per closed
phase; the detail is in its plan.

## 2026-11-09 — Theme Signal ([spec](specs/2026-11-09-theme-signal.md), [mockup](https://claude.ai/artifact/9XNT3KFJziXEyaKyDa48dr))

- **Signal**, a fourth theme for bags, footwear, accessories and western wear: a floating header over your first photo,
  your colour as the signal (section labels as pills, one bold band), products on grey tiles, best sellers in tabs by
  collection, a swipe row that says where you are ("01 / 10"), a footer over your hero photo, a grotesk voice. In the
  gallery once Frrata releases it in Admin › Themes.
- **Previews by what you sell:** a shop that sells bags or footwear sees bags or shoes in the theme preview, not kurtas.
  (Drawn for now; real photos replace them, each credited.)

## 2026-11-09 — GST in the core, the GST app, beyond fashion ([plan](plans/2026-11-09-gst-core-and-categories.md), [core mockup](https://claude.ai/artifact/M4VfNAgqFHYmhCxFwZmepE), [app mockup](https://claude.ai/artifact/NsxiFFFBorTsi9sct7zWgs))

- **Settings › Taxes as choices:** registration (Regular, Composition, Not registered) as radios, turnover and
  GSTR-1 filing as segments, prices include GST and business invoices as switches. Composition prints a bill of
  supply with its declaration; a shop without a GSTIN or on composition delivers within its own state.
- **Every product's tax:** an HSN found by words or digits, the rate it gives at this price (the ₹2,500 slab drawn),
  the price band no slab rate fits with a one-tap reprice, your own rate for a code we don't know, the unit, made in.
  Products › HSN codes sets them in bulk. A registered shop can't publish a product with no known rate.
- **Business buyers at checkout:** "Claim GST input credit" with the GSTIN checked as typed and its state matched;
  the invoice carries the buyer's GSTIN and business name.
- **Credit notes done right:** several per order — items brought back (part quantities), a discount agreed before
  the sale, goodwill (its own G series, no GST), what is left on a reversal — up to 30 November after the invoice's
  year. ₹ kept takes off what they gave back.
- **The GST app** (Growth and Scale; switch it on in Apps): the month or quarter, what to fix (missing HSN, short HSN, a bad GSTIN, series gaps, parcels back
  without a credit note), the GSTR-1 tables, and the files for your CA: GSTR-1 JSON for the offline tool, the tables as
  CSV, a sales register, Tally vouchers.
- **An Accountant** (with the GST app): invite your CA; they see GST and documents only — never costs or profit.
- **Beauty and wellness:** sign up as a beauty or wellness shop; products carry what the pack says (net quantity,
  best before, who made or packed it, ingredients, how to use) on the product page; returns say sealed only; no size
  chart or model sections where nothing is sized.
- **File from Frrata** (built, switched off): connect the GST portal with its OTP, push GSTR-1, see the portal's
  totals beside ours, file with the EVC OTP and keep the ARN. Parked: no GSP access is expected soon; the CA's GSTR-1
  JSON is uploaded on the GST portal instead.

## 2026-11-09 — Look v4: site settings, icons, menus, page-aware editing ([mockup](https://claude.ai/artifact/MmC6BnAps1XXSWyfy7PfSL), [research](research/2026-11-09-look-v4.md))

- **Site settings behind the gear:** your own palette of six colours (checked as you pick: it says when words would
  be hard to read), eight text styles with a computer and a phone size, weight, capitals and spacing, and the shop's
  icons. A new theme brings its own; another version of the same theme keeps yours.
- **Shop icons:** Line, Duotone or Solid, with a stroke weight; the menu, the bag, the phone tabs and the promise tiles
  wear them. Drawn on the server: no icon font, no extra script.
- **Menus:** your main menu (three levels, an icon beside any link), a footer menu and your own phone tabs; links
  only to your shop's pages; a searchable icon picker. Untouched, the menu is your collections, as before. Menus come
  across when you try another theme.
- **Every page in the preview:** Shop all, Bag and Checkout join Home, a product and a collection; the top bar says
  which page you're editing, and a page's options open with it.
- **A panel that folds** to a rail of icons on a computer.

## 2026-11-09 — Look v3 ([mockup](https://claude.ai/artifact/N3ATeKr1XxgTvEiPLjN2tq), research § 11 in [themes pro-grade](research/2026-11-08-themes-pro-grade.md))

- **Frrata Themes:** the gallery wears the Frrata Themes tile; each card carries it.
- **The customizer opens on a computer:** the shop drawn full width and scaled to fit, Phone one tap away.
- **Publish in one line:** a small confirm, the preview says Going live, then a popup over the shop with its address,
  View your shop, Keep editing and Undo. No separate page.
- **Confirmations** before discarding a draft, undoing a publish, restoring over a draft, trying another theme over a
  draft, and leaving before a save lands; removing a section is undone from a toast.
- **Style in groups:** colour bars, swatches, buttons that show their hover, header, footer and photo layouts as
  pictures, sliding choices.
- **Photos:** drop, paste or choose, or pick one of your product photos; a progress ring; tap to set what stays in
  view; description suggestions; plain-words fixes when an upload fails.
- **Add a section:** search, kinds with counts, picture cards, what fits the theme and what was made for it.
- **New designs (2.1):** Editorial's shop-panel header and over-the-photo header, Studio's over-the-photo header,
  and the Instagram strip footer for all three.

## 2026-11-09 — Themes 2.0: three themes, each with a job ([plan](plans/2026-11-09-themes-three.md), [showcase](https://claude.ai/artifact/8bvMF5mdhJQkVDayoVjabc))

- **Look › Themes offers three:** Editorial (occasion and designer wear; Atelier's arch lives here), Bazaar (big
  catalogues and sales), Studio (contemporary and basics; Minimal renamed). Shops on Classic or Atelier keep their look.
- **Each theme its own choices:** product photos (two across, stacked, thumbnails under or beside), a buy box that
  stays beside the photos, an Add to bag bar on phones, button style, shape and hover (press, lift, sheen), card hover,
  pages that fade or rise in, sections that rise as you scroll, a Split header, a Statement footer, footer colours, and
  a focused checkout (logo and legal footer only).
- **Sample pieces in the customizer:** a shop with fewer than four pieces sees drawn sample pieces and photos in its
  draft preview, never on the shop.
- **Customizer:** click a section in the preview to edit it; a section that fails is left out of the shop.

## 2026-11-09 — Own domains D·2 ([plan](plans/2026-11-08-shop-addresses.md), [mockup](https://claude.ai/artifact/XrDQj61tSBe4YKvUrH76xt))

- **Connect your own domain** from Settings › Shop address: type it any way (`https://www.KesarStudio.in/`), the three
  records show at once with Open <your DNS> and Send on WhatsApp, and the dialog finds them by itself, secures the
  domain and says Connected.
- **Make it your main address:** the shop's links, Google's address, share cards and Make a link move to it; Undo for
  8 s. On live payments, Razorpay must approve the domain first ("Razorpay approved it" on the row).
- **Remove a domain** at any time; one taken by another shop or by Frrata says so on its row.
- **Admin:** disconnect a shop's domain with a reason; settle a claim on another shop's main domain (move or refuse).
- Until Vercel Pro: the check runs daily (and while the dialog is open), and the frrata name keeps opening the shop
  instead of redirecting.

## 2026-11-08 — Shop addresses D·0–D·1 ([plan](plans/2026-11-08-shop-addresses.md), [spec](specs/2026-11-08-shop-addresses.md))

- **Every shop is at `name.frrata.shop`**; frrata.shop itself goes to Frrata.
- **Settings › Shop address:** change the name; free until the shop first opens, then two changes. An old address
  keeps working: it leads to the new one on the same page with its link tags, so Instagram links keep counting.
- **A name is never given to a second shop:** a shop's old names stay its own, for sign-up, partners and Admin alike.
- **Admin › Merchant › Addresses:** the shop's names; Frrata's rename (with a reason; the old name serves nothing);
  freeze address changes.
- **Admin › Names:** block a protected brand, an offensive word or a domain; release a held name with a reason.

## 2026-11-08 — Analytics A·1 ([plan](plans/2026-11-08-analytics-a1.md), [spec](specs/2026-11-08-analytics-a1.md))

- **Console › Analytics** (`/console/analytics`): where this period's orders came from (7, 30 or 90 days against the
  period before), judged on ₹ kept after returns: delivered, came back or lost, before ads and packaging. Orders,
  sales, COD, delivered and came back per source; counts, not shares, under 30; returns by pincode.
- **A source's page:** its campaigns and its latest 50 orders, each opening the order.
- **Make a link:** a link for an Instagram bio, a story, a WhatsApp broadcast or an ad, to any page, with a name;
  copied in one tap, and it says what its orders will show as. "A creator" goes to Offers.
- **The order page says where the order came from** ("Came from: Creator · Riya · diwali-drop").
- **The shop remembers where a shopper came from** (the link's tags and the referring site) until the order; a console
  preview never does. An abandoned order's click ids are erased with its other details.
- **₹ kept is a cost:** owners and admins see it; a partner only before handover; staff never. Product cost of goods
  follows the same rule.

## 2026-11-07 — 1D Orders ([plan](plans/2026-11-07-orders.md), [spec](specs/2026-11-07-orders.md))

- **The orders queue** (`/console/orders`): To confirm · To pack · On hold · All, with counts; 50 a page;
  search by number, name or the last digits of a phone; keys (`j` `k` `x` `c` `h` `p` `z`, `?` lists them,
  a switch turns them off); bulk Confirm (High-risk orders skipped and counted), Hold and Print slips.
- **COD risk as reasons, not a score:** several COD orders from one phone today, an earlier fake cancel, an
  address too short to deliver, a total far above the shop's usual; one next step (Call, WhatsApp).
- **The order page:** one primary action for its state (Confirm · Mark packed · Print packing slip · Cancel
  and refund); Hold and Undo for 8 s; Cancel with a reason, putting stock back per line; edit who it goes to
  until packed; team notes; activity with who did what (field names only, never shopper data).
- **Documents:** the packing slip (Code 128 barcode drawn locally; what to collect, or "Prepaid — collect
  nothing"; a cancelled order gets none, and the page says why) and the tax invoice or bill of supply,
  numbered once at Mark packed (`KESR/26-27/00001`, ≤ 16 characters; a series too long for the year is refused in
  Settings), CGST + SGST inside the seller's state, IGST outside. The seller's name and address are stored as the
  invoice is issued, and an issued invoice is never rewritten: a payment captured after packing is flagged on the
  order page (tell the courier, or refund) instead.
- **Bulk Undo** in one request, and Undo only ever reverses an order's latest action.
- **Stock per line:** a late payment, a switch to Pay on delivery or a cancel never takes or returns stock twice;
  the product page shows what checkout can sell.
- **Cleaner screens:** explanation behind an (i), limits, money and legal words kept visible; homepage claims
  that were not yet true corrected.
- **An open shop keeps its grievance officer:** opening needs a name, email and phone (owner, 2026-11-07), and a
  filled-in field cannot be emptied while the shop is open.
