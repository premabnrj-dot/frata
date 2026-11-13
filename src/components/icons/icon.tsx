// =============================================================================
// FILE: src/components/icons/icon.tsx — frrata's icons (brand spec 2026-11-07, chapter 4).
//
// One set, drawn for a merchant's day: a 24 grid with a 2 margin, stroke 1.75 (2.25 for the current page), round
// ends and joins. Each icon is TWO strokes: its body, in the colour of its text, and ONE detail — the tinge — in
// var(--icon-accent, currentColor). --icon-accent is set only inside a [data-tinge] frame (the navs and the More
// sheet today; globals.css), so in a table or beside a status badge the icon is one colour: there,
// colour means status. Server-safe (no hooks); always aria-hidden — the label beside it carries the meaning.
// =============================================================================

const ICONS = {
  home: ['M4 10.5 12 4l8 6.5V20H4z', 'M10 20v-4.5h4V20'],
  // PV·1: product video (the Apps row, the console card) and the shop's play mark.
  video: ['M3.5 6.5h12v11h-12z', 'M15.5 10.5 20.5 7.5v9l-5-3z'],
  play: ['M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z', 'M10 8.5v7l5.5-3.5z'],
  orders: ['M5.5 8h13l-1 12h-11z', 'M9 8a3 3 0 0 1 6 0'],
  products: ['M9 3.5h6l4.5 3-2 4-2.5-1.2V20.5h-6V9.3L6.5 10.5l-2-4z', 'M12 3.5v4'],
  collections: ['M4 4h7v7H4zM4 13h7v7H4zM13 13h7v7h-7z', 'M13 4h7v7h-7z'],
  settings: ['M4 7h10 M18 7h2 M4 17h4 M12 17h8', 'M16 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M10 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'],
  activity: ['M3 12h4l3-7 4 14 3-7', 'M17 12h4'],
  merchants: ['M4.5 9.5V20h15V9.5 M10 20v-5h4v5', 'M3.5 9.5 5 4h14l1.5 5.5z'],
  plans: ['M3 6h18v12H3z M6.5 14.5h4', 'M3 10h18'],
  staff: ['M5 20c1-4 3.8-6 7-6s6 2 7 6', 'M12 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z'],
  admin: ['M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z', 'M9 12l2.2 2.2L15.5 10'],
  external: ['M13 5h6v6 M19 5l-8 8', 'M17 14v5H5V7h5'],
  // Apps (modules foundation, 2026-11-07): three tiles and the one being added.
  apps: ['M4 4h7v7H4zM4 13h7v7H4zM13 13h7v7h-7z', 'M16.5 4v7 M13 7.5h7'],
  // Look (themes, 2026-11-08): a shop front, its awning the tinge.
  look: ['M5 10v10h14V10 M10 20v-5h4v5', 'M4 10l1.5-5h13L20 10c0 1.4-1.1 2.5-2.5 2.5S15 11.4 15 10c0 1.4-1.1 2.5-2.5 2.5S10 11.4 10 10c0 1.4-1.1 2.5-2.5 2.5S5 11.4 5 10'],
  reviews: ['M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z', 'M10 12.2l1.5 1.5 2.7-2.7'],
  menu: ['M4 7h16 M4 17h16', 'M4 12h16'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  // Neel N1: the sidebar as a rail (a panel and its left column).
  sidebar: ['M4 5h16v14H4z', 'M9.5 5v14'],
  // Neel N1: signing out (a door and the way out).
  signout: ['M10 4H5v16h5', 'M14 8l4 4-4 4M18 12H9'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M20 20l-4-4'],
  upload: ['M4 17v3h16v-3', 'M12 15V4 M7.5 8.5 12 4l4.5 4.5'],
  // The merchant's day (brand book chapter 4): ready for pages and empty states.
  cod: ['M3 7h18v10H3z', 'M9.5 9.5h5 M9.5 12h5 M9.5 9.5c3 0 3 3 0 3l3.5 3'],
  prepaid: ['M7.5 3h9v18h-9z', 'M10 12.2l1.6 1.6 3-3.2'],
  shipped: ['M3 7h11v9H3z M14 10h3.5l3.5 3.5V16h-7z', 'M7 18.5a1.5 1.5 0 1 0 0-.01 M17 18.5a1.5 1.5 0 1 0 0-.01'],
  returned: ['M4 11h10v9H4z', 'M8.5 7H15a5 5 0 0 1 0 10h-1 M11 4.5 8.5 7 11 9.5'],
  deliveryFailed: ['M4 8l8-4 8 4v8l-8 4-8-4z', 'M10 10.5l4 4 M14 10.5l-4 4'],
  size: ['M3 9h18v6H3z', 'M6.5 9v3 M10 9v2 M13.5 9v3 M17 9v2'],
  risk: ['M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z', 'M12 8.5v4.5 M12 16.2v.1'],
  confirmed: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M8 12.5l2.7 2.7L16 9.8'],
  pack: ['M4 8l8-4 8 4v8l-8 4-8-4z', 'M4 8l8 4 8-4 M12 12v8'],
  slip: ['M6 3h12v18l-3-2-3 2-3-2-3 2z', 'M9 8h6 M9 11.5h6 M9 15h3'],
  payout: ['M5 10v7 M10 10v7 M14 10v7 M19 10v7 M3 20h18', 'M3 10l9-6 9 6'],
  messages: ['M4 5h16v11H9l-5 4z', 'M8 9.5h8 M8 12.5h5'],
  stock: ['M4 12l8 4 8-4 M4 16l8 4 8-4', 'M12 4l8 4-8 4-8-4z'],
  campaigns: ['M4 10v4h3l8 4V6L7 10z', 'M18.5 9a4 4 0 0 1 0 6'],
  profit: ['M4 17l5-5 4 3 7-8', 'M15 7h5v5'],
  // A price tag (Offers): the tag, then its hole and a cut.
  offers: ['M4 4h7l9 9-7 7-9-9z', 'M8 8h.01 M10.5 14.5l4-4'],
  // Visual changes (owner-approved 2026-11-08): no Unicode glyph stands in for a control, and no two nav items share one.
  // Themes (Admin): a swatch card, three colours, the top one the tinge.
  themes: ['M5 3h7v18H5z M12 8l6.5-2.5 2.5 6.5L12 15.5', 'M5 8h7 M5 13h7'],
  // Partners: two people, the one behind the tinge.
  partners: ['M3 20c.8-3.3 3-5 5.5-5s4.7 1.7 5.5 5 M8.5 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M15 12.5a2.7 2.7 0 1 0 0-5.4 M16.5 15c2 .4 3.6 2 4.5 5'],
  // Your details: a card with a person on it.
  details: ['M3 5h18v14H3z M13.5 10h4.5 M13.5 13.5h3', 'M8 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M5 16.5c.6-1.6 1.7-2.5 3-2.5s2.4.9 3 2.5'],
  up: ['M12 19V5', 'M6 11l6-6 6 6'],
  down: ['M12 5v14', 'M6 13l6 6 6-6'],
  eye: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  eyeOff: ['M4.5 8.5C3.2 10.1 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1.1 M9 5.9c.9-.3 1.9-.4 3-.4 6 0 9.5 6.5 9.5 6.5s-.8 1.5-2.2 3', 'M3 3l18 18'],
  undo: ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
  redo: ['M15 14l5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13'],
  drag: ['M9 6h.01 M9 12h.01 M9 18h.01', 'M15 6h.01 M15 12h.01 M15 18h.01'],
  chevron: ['M9 6l6 6-6 6', 'M9 6l6 6-6 6'],
  back: ['M15 6l-6 6 6 6', 'M15 6l-6 6 6 6'],
  gear: ['M10.3 3.5h3.4l.5 2.4 1.7 1 2.3-.8 1.7 2.9-1.8 1.6v2l1.8 1.6-1.7 2.9-2.3-.8-1.7 1-.5 2.4h-3.4l-.5-2.4-1.7-1-2.3.8-1.7-2.9 1.8-1.6v-2L3.9 9l1.7-2.9 2.3.8 1.7-1z', 'M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
  rows: ['M8 6h12 M8 12h12 M8 18h12', 'M4 6h.01 M4 12h.01 M4 18h.01'],
  payments: ['M3 6h18v12H3z M7 15h3', 'M3 10h18'],
  pin: ['M12 21s-6-5.6-6-10a6 6 0 0 1 12 0c0 4.4-6 10-6 10z', 'M9.8 11a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0'],
  ship: ['M3 7h11v9H3z M14 10h3.5l3.5 3.5V16h-7z', 'M7 18.5a1.5 1.5 0 1 0 0-.01 M17 18.5a1.5 1.5 0 1 0 0-.01'],
  tax: ['M6 3h12v18l-3-2-3 2-3-2-3 2z', 'M9 14l6-6 M9.5 8.5h.01 M14.5 13.5h.01'],
  policy: ['M6 3h9l3 3v15H6z', 'M9 10h6 M9 13.5h6 M9 17h4'],
  brand: ['M12 21a9 9 0 1 1 9-9c0 2.5-2 3.5-3.5 3.5H15a2 2 0 0 0-1.5 3.3c.4.5.2 2.2-1.5 2.2z', 'M7.5 11h.01 M10 7.5h.01 M14.5 7.5h.01'],
  address: ['M12 21s7-5.6 7-11.5a7 7 0 1 0-14 0C5 15.4 12 21 12 21z', 'M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
  bell: ['M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z', 'M10 20.5a2 2 0 0 0 4 0'],
  // Apps gallery (2026-11-11): an app on a higher plan; the shackle is the tinge.
  lock: ['M5.5 11h13v9h-13z', 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3'],
  people: ['M3 20c.8-3.3 3-5 5.5-5s4.7 1.7 5.5 5 M8.5 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M15 12.5a2.7 2.7 0 1 0 0-5.4 M16.5 15c2 .4 3.6 2 4.5 5'],
} as const satisfies Record<string, readonly [string, string]>

export type IconName = keyof typeof ICONS

/** One frrata icon. `current` draws it at the current page's weight (2.25). */
export function Icon({ name, className, current = false }: { name: IconName; className?: string; current?: boolean }) {
  const [body, tinge] = ICONS[name]
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={current ? 2.25 : 1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={body} />
      <path d={tinge} style={{ stroke: 'var(--icon-accent, currentColor)' }} />
    </svg>
  )
}
