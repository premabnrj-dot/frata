// =============================================================================
// FILE: src/domains/modules/showcase.ts — what each app's page shows (Apps gallery, approved mockup 2026-11-11):
// a benefit headline, up to three features each with a drawn picture (as data: no screenshot, no real shopper),
// up to three questions, and what the app uses, in plain words. Pure data. No third-party price or claim here without
// its dated source (architecture review A6). Who bills what lives on the registry (`usage`), never twice.
// =============================================================================

import type { ModuleKey } from './registry'

export type Shot =
  | { kind: 'chat'; lines: { from: 'shop' | 'shopper'; text: string }[]; foot?: { text: string; chip: string } }
  | { kind: 'rows'; title: string; rows: { text: string; chip?: string; tone?: 'ok' | 'warn' | 'neutral' }[] }
  | { kind: 'stats'; items: { label: string; value: string }[]; note?: string }

export type Feature = { title: string; line: string; shot: Shot }
export type Showcase = { headline: string; features: readonly Feature[]; questions: readonly { q: string; a: string }[]; uses: readonly string[] }

export const SHOWCASE: Record<ModuleKey, Showcase> = {
  communication: {
    headline: 'WhatsApp on your own business number, with one inbox for your team.',
    features: [
      { title: 'COD confirmed by a reply', line: 'Each COD order asks once; a Yes moves it to To pack.', shot: { kind: 'chat', lines: [{ from: 'shop', text: 'Confirm your order KS-1043, ₹2,490 cash on delivery?' }, { from: 'shopper', text: 'Yes, confirm' }], foot: { text: 'Confirmed by the shopper', chip: 'To pack' } } },
      { title: 'Shipped and delivered updates', line: 'Sent from your number when the courier moves it.', shot: { kind: 'chat', lines: [{ from: 'shop', text: 'Your order KS-1043 is on its way with Delhivery.' }, { from: 'shop', text: 'Delivered today. Thank you for shopping with us.' }] } },
      { title: 'One inbox for your team', line: 'Notes, who has it, and quick replies.', shot: { kind: 'rows', title: 'Inbox · 4 waiting', rows: [{ text: 'Asha · size question', chip: 'Riya', tone: 'neutral' }, { text: 'Meera · where is my order', chip: 'New', tone: 'warn' }, { text: 'Kavya · exchange', chip: 'Done', tone: 'ok' }] } },
    ],
    questions: [
      { q: 'Can I keep using the WhatsApp Business app?', a: 'Yes. Connect the number you already use; chats appear in both.' },
      { q: 'Who pays for the messages?', a: 'Meta bills your number directly. Frrata adds nothing.' },
    ],
    uses: ['Shoppers’ names, phones and order details, to send their updates', 'Chats on your number, kept for your team'],
  },
  rto_shield: {
    headline: 'Confirm COD before you pack, so fewer parcels come back.',
    features: [
      { title: 'COD waits for a confirm', line: 'An order is packed only after the shopper says yes.', shot: { kind: 'rows', title: 'To confirm', rows: [{ text: 'KS-1043 · COD ₹2,490', chip: 'Waiting', tone: 'warn' }, { text: 'KS-1044 · COD ₹1,890', chip: 'Confirmed', tone: 'ok' }] } },
      { title: 'Your rules for risky orders', line: 'A small commitment fee, or pay online, for the orders you choose.', shot: { kind: 'rows', title: 'Rules', rows: [{ text: 'Pincode with many returns', chip: 'Ask to pay online', tone: 'neutral' }, { text: 'New phone, over ₹3,000', chip: '₹99 to confirm', tone: 'neutral' }] } },
      { title: 'History by pincode and phone', line: 'See where parcels come back before you ship.', shot: { kind: 'stats', items: [{ label: 'Came back · 30 days', value: '21' }, { label: 'Worst pincode', value: '110092' }] } },
    ],
    questions: [{ q: 'Does it need Messages?', a: 'Yes: the confirm is a WhatsApp reply on your number.' }],
    uses: ['COD orders, the shopper’s phone and pincode'],
  },
  ship: {
    headline: 'Shiprocket labels, tracking and failed deliveries, from the order page.',
    features: [
      { title: 'A label from the Pack button', line: 'The courier is picked by rate and pincode.', shot: { kind: 'rows', title: 'KS-1043 · packed', rows: [{ text: 'Delhivery Surface · 3 days', chip: 'Cheapest', tone: 'ok' }, { text: 'Xpressbees · 2 days', chip: 'Fastest', tone: 'neutral' }] } },
      { title: 'Tracking for shoppers', line: 'On your shop’s order page, in your look.', shot: { kind: 'rows', title: 'Arrives Thu 14 Nov', rows: [{ text: 'Packed', chip: '✓', tone: 'ok' }, { text: 'Shipped', chip: '✓', tone: 'ok' }, { text: 'Out for delivery', tone: 'neutral' }] } },
      { title: 'Failed deliveries, one queue', line: 'The courier’s reason and one action each.', shot: { kind: 'rows', title: 'Couldn’t deliver · 2', rows: [{ text: 'KS-1031 · shopper not home', chip: 'Re-attempt', tone: 'warn' }, { text: 'KS-1029 · address incomplete', chip: 'Fix address', tone: 'warn' }] } },
    ],
    questions: [{ q: 'Who pays for freight?', a: 'Shiprocket bills your Shiprocket account.' }],
    uses: ['Orders, the delivery address and phone, sent to Shiprocket'],
  },
  true_profit: {
    headline: 'What each product, pincode and campaign kept after returns.',
    features: [
      { title: 'Profit per delivered order', line: 'After returns, freight, fees and COD charges.', shot: { kind: 'stats', items: [{ label: '₹ kept · 30 days', value: '₹38,420' }, { label: 'Per delivered order', value: '₹941' }] } },
      { title: 'By product, size and colour', line: 'Which pieces earn, and which come back.', shot: { kind: 'rows', title: 'Products', rows: [{ text: 'Sabz chanderi kurta', chip: '₹1,120', tone: 'ok' }, { text: 'Gulnar tissue set', chip: '−₹210', tone: 'warn' }] } },
    ],
    questions: [{ q: 'Who can see it?', a: 'Owners and admins. Staff never see costs.' }],
    uses: ['Orders, costs you entered, and courier charges'],
  },
  reviews: {
    headline: 'Photo reviews from delivered buyers, on the product page.',
    features: [
      { title: 'Asked after delivery', line: 'Only buyers whose order was delivered. One ask.', shot: { kind: 'chat', lines: [{ from: 'shop', text: 'Your kurta was delivered. How is it? Add a photo and stars.' }, { from: 'shopper', text: '★★★★★ Fits perfectly' }] } },
      { title: 'Photos and stars on the page', line: 'In your theme’s style, under the sizes.', shot: { kind: 'stats', items: [{ label: 'Rating', value: '4.8' }, { label: 'Reviews', value: '126' }], note: 'Verified buyer' } },
      { title: 'You approve each one', line: 'Nothing shows until you say so.', shot: { kind: 'rows', title: 'To approve · 3', rows: [{ text: '★★★★★ Lovely fabric', chip: 'Approve', tone: 'neutral' }, { text: '★★★★☆ Size runs small', chip: 'Approve', tone: 'neutral' }] } },
    ],
    questions: [{ q: 'What if I turn it off?', a: 'Asks stop at once. Reviews stay saved and hidden until you turn it on again.' }],
    uses: ['Delivered orders and the buyer’s first name', 'The buyer’s WhatsApp number, to ask once'],
  },
  marketplace_export: {
    headline: 'Your catalogue as marketplace upload files, sizes and colours mapped.',
    features: [
      { title: 'One file per marketplace', line: 'Your products in the columns each one asks for.', shot: { kind: 'rows', title: 'Exports', rows: [{ text: 'Myntra · 48 products', chip: 'Ready', tone: 'ok' }, { text: 'Ajio · 48 products', chip: '2 to fix', tone: 'warn' }] } },
      { title: 'Problems before you upload', line: 'Each one with the product and the fix.', shot: { kind: 'rows', title: 'To fix', rows: [{ text: 'Gulnar set · no fabric', chip: 'Add', tone: 'warn' }, { text: 'Sabz kurta · size XL unmapped', chip: 'Map', tone: 'warn' }] } },
    ],
    questions: [],
    uses: ['Your catalogue: products, photos, sizes and prices'],
  },
  size_fit: {
    headline: 'Fewer size returns: a size finder that learns from your returns.',
    features: [
      { title: 'A size finder on the page', line: 'Height and usual size in, a size out.', shot: { kind: 'rows', title: 'Find my size', rows: [{ text: '5′4″ · usually M', tone: 'neutral' }, { text: 'We suggest L for this kurta', chip: 'L', tone: 'ok' }] } },
      { title: '“Runs small” from returns', line: 'Shown once enough returns say so.', shot: { kind: 'stats', items: [{ label: 'Size returns · 30 days', value: '9' }, { label: 'Runs', value: 'Small' }] } },
    ],
    questions: [],
    uses: ['Returns and their reasons', 'Sizes shoppers picked'],
  },
  cart_flows: {
    headline: 'Bring back bags left behind, on WhatsApp, to shoppers who agreed.',
    features: [
      { title: 'A reminder for a left bag', line: 'Once, an hour later, with the bag.', shot: { kind: 'chat', lines: [{ from: 'shop', text: 'You left the Sabz chanderi kurta in your bag. Still want it?' }, { from: 'shopper', text: 'Yes, buying now' }] } },
      { title: 'Back in stock', line: 'Shoppers who asked hear when their size returns.', shot: { kind: 'rows', title: 'Back in stock', rows: [{ text: 'Sabz kurta · M', chip: '14 waiting', tone: 'neutral' }] } },
    ],
    questions: [{ q: 'Who gets these?', a: 'Only shoppers who agreed to messages from your shop.' }],
    uses: ['Bags of signed-in shoppers', 'Their WhatsApp number and consent'],
  },
  gst: {
    headline: 'Your GSTR-1 each month, and the files your CA needs.',
    features: [
      { title: 'The month’s tables', line: 'From your invoices and credit notes, month or quarter.', shot: { kind: 'stats', items: [{ label: 'Taxable value · Oct', value: '₹4,12,380' }, { label: 'Tax', value: '₹31,206' }] } },
      { title: 'What to fix before you file', line: 'Each problem with the order that has it.', shot: { kind: 'rows', title: 'Fix · 2', rows: [{ text: 'A GSTIN that doesn’t check out', chip: 'Open', tone: 'warn' }, { text: 'Invoice numbers missing', chip: 'Open', tone: 'warn' }] } },
      { title: 'Files for your CA', line: 'GSTR-1 JSON, sheets, sales register and Tally.', shot: { kind: 'rows', title: 'For your CA', rows: [{ text: 'GSTR-1 · October', chip: 'JSON', tone: 'neutral' }, { text: 'Sales register', chip: 'XLSX', tone: 'neutral' }] } },
    ],
    questions: [{ q: 'Can my accountant sign in?', a: 'Yes, with the Accountant role: GST only, nothing else.' }],
    uses: ['Invoices, credit notes and your GSTIN'],
  },
  ekcode: {
    headline: 'Shoppers filled in at checkout in one tap, every phone checked.',
    features: [
      { title: 'Name, phone and address in one tap', line: 'Shoppers who use EkCode at any shop.', shot: { kind: 'rows', title: 'Checkout', rows: [{ text: 'Continue with EkCode', chip: 'One tap', tone: 'ok' }, { text: 'Asha Rao · 98•••• 210', tone: 'neutral' }] } },
      { title: 'Every phone checked', line: 'A code on WhatsApp before the order.', shot: { kind: 'chat', lines: [{ from: 'shop', text: 'Your EkCode sign-in code is 482913.' }] } },
      { title: 'Your shoppers, your list', line: 'Who signed in, and their orders.', shot: { kind: 'stats', items: [{ label: 'Orders filled in', value: '38%' }, { label: 'Shoppers', value: '1,204' }] } },
    ],
    questions: [{ q: 'Does a shopper need an account?', a: 'No. Guest checkout always stays.' }],
    uses: ['Shoppers’ name, phone and the address they choose, shared at checkout', 'Their consent, one row each'],
  },
  product_video: {
    headline: 'A reel or a film on each product, played when a shopper taps it.',
    features: [
      { title: 'Second in the photos', line: 'And beside the sizes, a tap away.', shot: { kind: 'rows', title: 'Sabz chanderi kurta', rows: [{ text: 'Photo 1', tone: 'neutral' }, { text: '▶ Reel · 0:24', chip: 'Video', tone: 'ok' }] } },
      { title: 'Price and Add to bag under it', line: 'Shoppers buy without leaving the video.', shot: { kind: 'rows', title: '▶ 0:24', rows: [{ text: '₹2,490 · M', chip: 'Add to bag', tone: 'ok' }] } },
    ],
    questions: [{ q: 'How long can a video be?', a: 'Up to a minute, one per product.' }],
    uses: ['The videos you upload'],
  },  delivery_zones: {
    headline: 'Charge, promise and take pay on delivery by PIN code, the way couriers really work.',
    features: [
      { title: 'Zones filled in for you', line: 'Metro, Tier 2, Rest of India and Special, each with its own charge, days and COD.', shot: { kind: 'rows', title: 'Zones', rows: [{ text: 'Metro · ₹59 · 2–3 days', chip: 'COD ₹49', tone: 'ok' }, { text: 'Rest of India · ₹99 · 4–7 days', chip: 'COD up to ₹3,000', tone: 'ok' }, { text: 'Special · ₹149 · 6–10 days', chip: 'Pay online', tone: 'warn' }] } },
      { title: 'Rules for a PIN code', line: 'Pay online only where COD keeps coming back; no delivery where couriers don’t go.', shot: { kind: 'rows', title: 'PIN code rules', rows: [{ text: '110094 · North East Delhi', chip: 'Pay online', tone: 'warn' }, { text: '744101 · South Andaman', chip: "Don't deliver", tone: 'neutral' }] } },
      { title: 'A date that holds', line: 'Ship days, a daily cutoff and your holidays decide the date shoppers see.', shot: { kind: 'stats', items: [{ label: 'Ordered now', value: 'Wed, 12 Nov' }, { label: 'Arrives by', value: 'Tue, 18 Nov' }] } },
    ],
    questions: [
      { q: 'What do shoppers see without it?', a: 'Every shop has the PIN code check and the charges before checkout, with one delivery charge and one COD fee.' },
      { q: 'Does it change anything when I turn it on?', a: 'No. Your current settings act as one zone until you change a zone.' },
    ],
    uses: ['Your delivery charges, COD rules and dispatch days', 'India Post’s PIN code directory'],
  },

}

/** What turning an app off does, in the confirm only (Rule 0: never on the page; Apps A2). 1–3 short lines each, true
 *  of the app as built: "cancelled" only for an app that queues work (`outboxKinds`; impact review A2). */
export const OFF: Record<ModuleKey, readonly string[]> = {
  communication: ['Messages stops for your shop.', 'Your number stays connected to Meta; chats wait here.'],
  rto_shield: ['COD orders go to To pack without a confirm.'],
  ship: ['Labels and tracking stop from the Pack button.', 'Labels already made stay with Shiprocket.'],
  true_profit: ['Profit per order leaves Orders and Analytics.', 'Nothing it read is deleted.'],
  reviews: ['Review asks stop.', 'Reviews already on your products stay.'],
  marketplace_export: ['Exports stop.', 'Files you downloaded stay yours.'],
  size_fit: ['The size finder leaves your product pages.'],
  gst: ['GST returns leave the console.', 'Your invoices stay GST-correct.'],
  ekcode: ['The EkCode button leaves your checkout.', 'Shoppers’ rows stay.'],
  product_video: ['Videos leave your product pages.', 'Uploaded videos stay.'],
  delivery_zones: ['Your zones and PIN code rules stop applying.', 'Checkout goes back to your Settings: one charge, one COD fee.'],
  cart_flows: ['Bag reminders stop.'],
}
