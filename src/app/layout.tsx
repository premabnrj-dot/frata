import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'Frrata', template: '%s · Frrata' },
  description: 'Fashion commerce for Indian D2C brands: storefront, COD, shipping and WhatsApp in one place.',
  // The platform's icon (src/components/brand/app-icon.tsx); a shop's layout replaces it (a shop never wears ours).
  icons: { icon: '/frrata-icon', apple: '/frrata-apple-icon' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${inter.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
