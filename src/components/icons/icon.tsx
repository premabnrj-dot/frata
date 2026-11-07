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
  reviews: ['M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z', 'M10 12.2l1.5 1.5 2.7-2.7'],
  menu: ['M4 7h16 M4 17h16', 'M4 12h16'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
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
