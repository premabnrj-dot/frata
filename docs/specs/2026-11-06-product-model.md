# Product model: states, categories, attributes, swatches, SEO, product page
Status: approved and built · Date: 2026-11-06 · Prototype: https://claude.ai/artifact/YPKoghPrDtYzHasoJYKEXE · Approved: owner, 2026-11-06 ("go with your recommendations"; Search and sharing collapsed by default)

## Goal
Ranked problems 3 (catalogue operations) and 5 (a shop that looks and reads
right); the data Google, Meta and WhatsApp need. Built before the storefront
(1B), which reads every field here. Measure: a merchant sets up a product with
colours, a category and its details in under 10 minutes; every live product
passes Google's apparel requirements (colour, size, gender, age group).

## Owner asks (2026-11-06)
Product states (pre-order, out of stock, draft…); categories, attributes and
swatches researched on current sources; memorable slugs in URLs; default
product SEO; the product page reworked; title editable (done); default SKUs
(done); summary card (done).

## Design (see the prototype)
- **Two questions apart.** Status (Draft, Active with optional go-live time,
  Unlisted = link only, Archived) is set by the merchant. Availability per
  size and colour (in stock, low, sold out + notify me, pre-order with ship-by
  date and cap, made to order with lead days) is derived from stock, a
  "when it runs out" rule and dates; never stored.
- **Pre-order payment:** prepaid by default; "token by UPI, rest on delivery"
  as an option; no full COD on pre-orders. Ship-by date on product, bag,
  checkout, confirmation and order line.
- **Category:** one per product from Shopify's open taxonomy (MIT), pinned to
  v2026-10, global read-only tables; it brings the attributes asked for and
  maps to Google and Meta categories.
- **Collections:** the merchant's own, hand-picked or automatic (rules on
  category, attributes, price, stock; match all/any).
- **Attributes:** from the category, the merchant's labels mapped to standard
  values; Frata additions for Indian fashion (occasion; craft: block print,
  bandhani, ikat, chikankari, zari; fabrics: chanderi, khadi, mul, banarasi;
  fit; set includes), flagged and mapped.
- **Swatches:** colour values carry a name, a family (filters) and a swatch:
  a crop of a product photo (prints) or a colour. Name always in text;
  selected state not by colour alone (WCAG 2.2, 3:1); sold-out in the chosen
  size crossed through, still visible.
- **Addresses:** `/console/products/<handle>` and `/products/<handle>`;
  handle from the title until published, then fixed; a change keeps the old
  one in history with a 301; never reused.
- **SEO made for every product, editable:** title `Title – Colour | Shop`,
  description from fabric, price, COD, returns; ProductGroup JSON-LD with
  variants (price from paise); shipping and returns once for the shop;
  variant links `?colour=&size=` to one canonical; 1200×630 share image
  < 600 KB; per state: Draft 404, Unlisted noindex + out of sitemap but WhatsApp
  preview, Archived 301 to a replacement or its collection else 410. Google
  and WhatsApp previews in the editor.
- **Product page order:** title (heading), photos, description; sizes,
  colours, stock and the "when it runs out" rule in one grid; details
  (attributes) from the category; search and sharing with previews. Side,
  sticky: status and go-live, summary, organise (category, collections),
  "ready for" (shop, Google, Meta, WhatsApp).

## Build order
1A·4 addresses → 1A·5 status and availability → 1A·6 category, attributes,
swatches → 1A·7 collections → 1A·8 SEO defaults and the reworked page.

## Facts used (all checked 2026-11-06; dates are the sources' own)
Shopify Unlisted status (shopify.dev changelog, 21 Oct 2025); product status,
future publishing (help.shopify.com, live, undated); pre-order selling plans
(shopify.dev, live; 2026-01 release notes); product taxonomy v2026-05 (10 Jun
2026, saris, lehengas, dupattas) and v2026-10 (27 Oct 2026); collections
multi-source (16 Jul 2026); variant redesign (shopify.com blog, 28 Oct 2026,
vendor). Google Search Central: URL structure (21 Oct 2026), ecommerce URLs
(10 Dec 2025), canonicals (10 Jul 2026), redirects (14 Apr 2026), title links
(10 Dec 2025), snippets (20 Apr 2026), merchant listings and variants (8 Sep
2026), images (2 Mar 2026), Core Web Vitals (10 Dec 2025). Merchant Center
availability, apparel attributes, images (live, ©2026). WhatsApp link previews
(21 May 2026). Baymard out-of-stock (2025), product page (18 Mar 2026), lists
and filtering (9 Sep 2025), mobile (14 Jul 2026), apparel (12 Jun 2026). WCAG
2.2 non-text contrast (4 Oct 2026). CCPA dark patterns advisory (Jun 2025).
No current source found: Indian rules specific to pre-orders; Indian brands'
COD policy on pre-orders.
