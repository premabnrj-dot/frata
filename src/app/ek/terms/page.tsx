import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Terms' }

// Draft for counsel (plan task 11).
export default function EkTerms() {
  return (
    <article className="grid gap-4 text-sm leading-6">
      <h1 className="text-xl font-semibold">Terms</h1>
      <p>EkCode fills in your details at shops that show it, when you tap Continue there. A shop is responsible for its own orders, deliveries and returns.</p>
      <p>Use EkCode only with your own WhatsApp number. Codes are for you alone; we never ask for one by call or message.</p>
      <p>EkCode is for people 18 and over.</p>
    </article>
  )
}
