import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
// The shop's own sheet (Signal S2-0); every non-shop entry adds globals.css (the app sheet) after it.
import './shop.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
// Not preloaded (speed review P6): the console's figures face; on a shop's page it was a 40 kB download ahead of
// the product photo. It still loads wherever a page uses it.
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap', preload: false })

export const metadata: Metadata = {
  title: { default: 'Frrata', template: '%s · Frrata' },
  description: 'Fashion commerce for Indian D2C brands: storefront, COD, shipping and WhatsApp in one place.',
  // The platform's icon (src/components/brand/app-icon.tsx); a shop's layout replaces it (a shop never wears ours).
  icons: { icon: '/frrata-icon?v=1', apple: '/frrata-apple-icon?v=1' }, // bump ?v when the mark changes (served immutable)
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${inter.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
