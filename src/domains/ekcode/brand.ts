// =============================================================================
// FILE: src/domains/ekcode/brand.ts — EVERY WORD A SHOPPER READS FROM EKCODE, in one place (frata-design-language §
// EkCode: its own brand; nothing a shopper sees names the platform behind it — `check:ekcode-brand` reads this file).
// English only (owner). Short, verb first. Pure.
// =============================================================================

export const EK = {
  name: 'EkCode',
  continueWith: 'Continue with',
  home: {
    title: 'One code for checkout at every shop that shows EkCode',
    signIn: 'Sign in to your EkCode',
  },
  phone: {
    title: 'Your WhatsApp number',
    send: 'Send code on WhatsApp',
    invalid: 'Starts with 6, 7, 8 or 9',
    back: (shop: string) => `Back to ${shop}`,
  },
  code: {
    title: 'Enter the code',
    sentTo: (masked: string) => `On WhatsApp · ${masked}`,
    change: 'Change',
    openWhatsApp: 'Open WhatsApp',
    resend: 'Resend',
    resendIn: (s: number) => `Resend in 0:${String(s).padStart(2, '0')}`,
    notArrived: "Didn't get it?",
    guest: 'Check out as a guest',
    wrong: (left: number) => `Code doesn't match · ${left} ${left === 1 ? 'try' : 'tries'} left`,
    expired: 'Code expired',
    checked: 'Checked',
  },
  locked: { title: 'Too many tries', tryAt: (time: string) => `Try again at ${time}.` },
  slow: { title: 'One moment', body: 'Checking this browser…' },
  create: {
    title: 'Create your EkCode',
    name: 'Your name',
    action: 'Create my EkCode',
    notNow: 'Not now',
  },
  confirm: {
    title: (shop: string) => `Continue to ${shop}`,
    deliverTo: 'Deliver to',
    newAddress: 'New address',
    newAddressHint: (shop: string) => `Fill it in at ${shop}`,
    gets: (shop: string) => `${shop} gets`,
    items: { name: 'Name', phone: 'Phone', address: 'This address' },
    action: 'Continue',
    notYou: 'Not you?',
  },
  shop: {
    notYou: 'Not you?',
    saveAddress: 'Save this address to',
  },
  footer: { privacy: 'Privacy', terms: 'Terms', contact: 'Contact' },
  error: 'Something went wrong. Try again.',
} as const
