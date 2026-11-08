import 'server-only'
import type { Lang } from '@/lib/queries/storefront'

// =============================================================================
// FILE: src/components/storefront/words.ts — the words Frrata writes on a shop, in English and Hindi (themes T2).
// What the merchant types (names, descriptions, sections) stays as typed. Imported by SERVER components only: a
// client island gets the strings it shows as a prop (BUY below), so a shop's browser never downloads the other
// language (check-client-bundle fails a shop chunk holding Devanagari). Templates use {name} placeholders, filled
// by `fill`, so islands receive plain strings. The Hindi needs a fluent reader's review before a Hindi shop goes
// live (plan § T2 review). Checkout, emails and invoices stay English for now.
// =============================================================================

export type { Lang }

const EN = {
  shopAll: 'Shop all', menu: 'Menu', contact: 'Contact', home: 'Home', shop: 'Shop', search: 'Search', bag: 'Bag',
  shopNav: 'Shop', collectionsNav: 'Collections', categoriesNav: 'Categories', tabsNav: 'Shop tabs', policiesNav: 'Policies',
  policy: { shipping: 'Shipping', returns: 'Returns and exchanges', privacy: 'Privacy', terms: 'Terms of sale', contact: 'Contact us' },
  grievance: 'Grievance officer',
  from: 'From {price}', colours: '{n} colours',
  tag: { 'Sold out': 'Sold out', 'Pre-order': 'Pre-order', 'Made to order': 'Made to order' },
  about: 'About this piece', details: 'Details',
  ships: 'Ships in {d} {days} · arrives in {m} days to metros, {r} elsewhere', day: 'day', days: 'days',
  returns: { exchange_or_refund: '{d}-day returns and exchanges', exchange_only: '{d}-day exchanges', refund_only: '{d}-day returns', none: 'No returns on this shop' },
  taxIncluded: 'Price includes GST.', taxAdded: 'GST is added at checkout.',
  seeAll: 'See all',
  emptyShop: 'New pieces are on their way.', emptyCollection: 'Nothing here right now. New pieces are on their way.',
  gone: '{title} is no longer available', goneSub: 'Here is what is new instead.', notHere: 'This page is not here', seeEverything: 'See everything in the shop',
  promise: { label: 'Our promises', cod: 'Pay on delivery', freeShipping: 'Free shipping above {above}', exchange: '{d}-day exchange', returns: '{d}-day returns', exchangeOrReturns: '{d}-day exchange or returns', shipsDay: 'Ships in {d} day', shipsDays: 'Ships in {d} days' },
}
export type Words = typeof EN

const HI: Words = {
  shopAll: 'सब देखें', menu: 'मेन्यू', contact: 'संपर्क', home: 'होम', shop: 'शॉप', search: 'खोजें', bag: 'बैग',
  shopNav: 'शॉप', collectionsNav: 'कलेक्शन', categoriesNav: 'श्रेणियाँ', tabsNav: 'शॉप टैब', policiesNav: 'नीतियाँ',
  policy: { shipping: 'शिपिंग', returns: 'वापसी और एक्सचेंज', privacy: 'प्राइवेसी', terms: 'बिक्री की शर्तें', contact: 'संपर्क करें' },
  grievance: 'शिकायत अधिकारी',
  from: '{price} से', colours: '{n} रंग',
  tag: { 'Sold out': 'स्टॉक खत्म', 'Pre-order': 'प्री-ऑर्डर', 'Made to order': 'ऑर्डर पर बनेगा' },
  about: 'इस पीस के बारे में', details: 'विवरण',
  ships: '{d} {days} में भेजा जाएगा · मेट्रो शहरों में {m} दिन में, बाकी जगह {r} दिन में पहुँचेगा', day: 'दिन', days: 'दिन',
  returns: { exchange_or_refund: '{d} दिन में वापसी और एक्सचेंज', exchange_only: '{d} दिन में एक्सचेंज', refund_only: '{d} दिन में वापसी', none: 'इस शॉप पर वापसी नहीं होती' },
  taxIncluded: 'कीमत में GST शामिल है।', taxAdded: 'GST चेकआउट पर जुड़ेगा।',
  seeAll: 'सब देखें',
  emptyShop: 'नए पीस जल्द आ रहे हैं।', emptyCollection: 'अभी यहाँ कुछ नहीं है। नए पीस जल्द आ रहे हैं।',
  gone: '{title} अब उपलब्ध नहीं है', goneSub: 'इसकी जगह ये नए पीस देखें।', notHere: 'यह पेज यहाँ नहीं है', seeEverything: 'शॉप में सब देखें',
  promise: { label: 'हमारे वादे', cod: 'कैश ऑन डिलीवरी', freeShipping: '{above} से ऊपर फ्री शिपिंग', exchange: '{d} दिन में एक्सचेंज', returns: '{d} दिन में वापसी', exchangeOrReturns: '{d} दिन में एक्सचेंज या वापसी', shipsDay: '{d} दिन में भेजा जाएगा', shipsDays: '{d} दिन में भेजा जाएगा' },
}

/** The product page's island (BuyBox): plain strings only, so they cross to the browser as a prop. */
const BUY_EN = {
  sizeGuide: 'Size guide', addToBag: 'Add to bag', preorder: 'Pre-order', pick: 'Pick a {option}.', pickToSee: 'Pick a {option} to see when it ships.',
  soldOutPick: 'This one is sold out. Pick another size or colour.', preview: 'This is a preview: shoppers add to their bag here.',
  save: 'Save {amount}', freeAll: 'Free delivery', cod: 'Pay on delivery available', codExtra: ' ({fee} fee)', freeDelivery: 'Free delivery on this piece',
  delivery: 'Delivery {flat}', deliveryFreeAbove: ', free above {above}',
  inStock: 'In stock', lowStock: 'Only {n} left', preorderBy: 'Pre-order · ships by {date}', madeToOrder: 'Made to order · ships in {a}–{b} days', soldOut: 'Sold out',
  soldOutSr: ', sold out', size: 'Size', photos: 'Photos', choosePhoto: 'Choose a photo', photoOf: 'Photo {i} of {n}', photoAlt: '{title}, photo {i}',
  units: 'Units', cm: 'cm', inches: 'inches', closeGuide: 'Close size guide', offers: 'Offers',
}
export type BuyWords = typeof BUY_EN
const BUY_HI: BuyWords = {
  sizeGuide: 'साइज़ चार्ट', addToBag: 'बैग में डालें', preorder: 'प्री-ऑर्डर करें', pick: '{option} चुनें।', pickToSee: 'कब भेजा जाएगा, यह देखने के लिए {option} चुनें।',
  soldOutPick: 'यह स्टॉक में नहीं है। कोई और साइज़ या रंग चुनें।', preview: 'यह प्रीव्यू है: ग्राहक यहाँ बैग में डालते हैं।',
  save: '{amount} की बचत', freeAll: 'फ्री डिलीवरी', cod: 'कैश ऑन डिलीवरी उपलब्ध', codExtra: ' ({fee} शुल्क)', freeDelivery: 'इस पीस पर फ्री डिलीवरी',
  delivery: 'डिलीवरी {flat}', deliveryFreeAbove: ', {above} से ऊपर फ्री',
  inStock: 'स्टॉक में', lowStock: 'सिर्फ़ {n} बचे', preorderBy: 'प्री-ऑर्डर · {date} तक भेजा जाएगा', madeToOrder: 'ऑर्डर पर बनेगा · {a}–{b} दिन में भेजा जाएगा', soldOut: 'स्टॉक खत्म',
  soldOutSr: ', स्टॉक खत्म', size: 'साइज़', photos: 'फ़ोटो', choosePhoto: 'फ़ोटो चुनें', photoOf: 'फ़ोटो {i} / {n}', photoAlt: '{title}, फ़ोटो {i}',
  units: 'इकाई', cm: 'सेमी', inches: 'इंच', closeGuide: 'साइज़ चार्ट बंद करें', offers: 'ऑफ़र',
}

export const wordsFor = (lang: Lang | undefined): Words => (lang === 'hi' ? HI : EN)
export const buyWords = (lang: Lang | undefined): BuyWords => (lang === 'hi' ? BUY_HI : BUY_EN)
export { fill } from './fill'
export const WORDS_FOR_TEST = { EN, HI, BUY_EN, BUY_HI }
