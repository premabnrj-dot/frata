import Link from 'next/link'
import { button } from '@/components/ui/button'

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 p-6">
      <p className="text-sm font-semibold text-brand">Frata</p>
      <h1 className="text-4xl font-semibold tracking-tight">Sell your fashion label everywhere your customers are.</h1>
      <p className="text-muted-foreground">Storefront, checkout, COD, shipping and WhatsApp in one place, judged on the orders that are actually delivered.</p>
      <div><Link href="/login" className={button()}>Sign in</Link></div>
    </main>
  )
}
