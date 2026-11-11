import { EkMark } from '@/components/ekcode/mark'
import { EK } from '@/domains/ekcode-core/brand'

// EkCode's home: what it is, in one line (the page Meta checks for the "EkCode" name). The shopper's own page is P2.
export default function EkHome() {
  return (
    <section className="grid gap-5 pt-6">
      <EkMark height={44} />
      <h1 className="text-2xl font-semibold tracking-tight text-balance">{EK.home.title}</h1>
    </section>
  )
}
