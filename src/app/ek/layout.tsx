import type { Metadata } from 'next'
// Not a shop page: the app's stylesheet, as every non-shop entry adds (src/app/layout.tsx).
import '../globals.css'
import Link from 'next/link'
import { EkMark } from '@/components/ekcode/mark'
import { EK_ICON as icon } from '@/components/ekcode/icon'
import { EK } from '@/domains/ekcode-core/brand'

// =============================================================================
// FILE: src/app/ek/layout.tsx — EKCODE.IN (P1 task 8; frata-design-language § EkCode). Served only on EkCode's own
// host, through the rewrite to /ek (src/domains/tenancy/host.ts). Its own name, icon and look: nothing here names the
// platform behind it (check:ekcode-brand). English only.
// =============================================================================


export const metadata: Metadata = {
  title: { default: EK.name, template: `%s · ${EK.name}` },
  description: EK.home.title,
  icons: { icon, apple: icon },
  robots: { index: true, follow: true },
}

export default function EkLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[var(--ek-paper)] text-[var(--ek-ink)] flex flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--ek-line)] px-4 py-3 sm:px-6">
        <Link href="/" aria-label={EK.name}><EkMark height={24} label={false} /></Link>
      </header>
      <main className="flex-1 w-full max-w-md mx-auto px-4 py-6 sm:px-6">{children}</main>
      <footer className="flex flex-wrap justify-end gap-4 border-t border-[var(--ek-line)] px-4 py-3 text-xs text-[var(--ek-sub)] sm:px-6">
        <Link className="underline underline-offset-2" href="/privacy">{EK.footer.privacy}</Link>
        <Link className="underline underline-offset-2" href="/terms">{EK.footer.terms}</Link>
        <Link className="underline underline-offset-2" href="/contact">{EK.footer.contact}</Link>
      </footer>
    </div>
  )
}
