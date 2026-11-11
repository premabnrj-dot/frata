import type { Metadata } from 'next'
import localFont from 'next/font/local'

// Every page and its Server Actions stop at 60 s (Vercel's Pro default is 300 s, memory billed while waiting):
// cost guardrails G·1, scripts/check-duration.mjs. A page that needs longer exports its own.
export const maxDuration = 60
// The shop's own sheet (Signal S2-0); every non-shop entry adds globals.css (the app sheet) after it.
import './shop.css'

// Self-hosted (src/components/fonts/, OFL 1.1, from Fontsource 5.3.0, 2026-11-11): next/font/google fetched Google at
// build time and a bad answer failed production builds at random (Vercel, 2026-11-11). Latin, variable weight.
const inter = localFont({ src: '../components/fonts/inter/inter-latin-wght-normal.woff2', weight: '100 900', variable: '--font-inter-latin', display: 'swap',
  declarations: [{ prop: 'unicode-range', value: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD' }] })
// ₹ (U+20B9) and the rest of latin-ext: Inter's own file, fetched only where such a character is on the page (as
// Google's stylesheet did). --font-inter, which every sheet reads, is the two together (src/app/base.css).
const interExt = localFont({ src: '../components/fonts/inter/inter-latin-ext-wght-normal.woff2', weight: '100 900', variable: '--font-inter-ext', display: 'swap', preload: false, adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF' }] })
// Not preloaded (speed review P6): the console's figures face; on a shop's page it was a 40 kB download ahead of
// the product photo. It still loads wherever a page uses it.
const mono = localFont({ src: '../components/fonts/jetbrains-mono/jetbrains-mono-latin-wght-normal.woff2', weight: '100 800', variable: '--font-jetbrains', display: 'swap', preload: false })

export const metadata: Metadata = {
  title: { default: 'Frrata', template: '%s · Frrata' },
  description: 'Fashion commerce for Indian D2C brands: storefront, COD, shipping and WhatsApp in one place.',
  // The platform's icon (src/components/brand/app-icon.tsx); a shop's layout replaces it (a shop never wears ours).
  icons: { icon: '/frrata-icon?v=1', apple: '/frrata-apple-icon?v=1' }, // bump ?v when the mark changes (served immutable)
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${inter.variable} ${interExt.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
