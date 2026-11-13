'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { kindOf, startSizes, type Kind } from '@/domains/catalogue/kind'
import { createProduct } from '../actions'
import { PageHeader } from '@/components/layout/page-header'

const CHOICES: { kind: Kind; label: string; sizes: string }[] = [
  { kind: 'sized', label: 'Clothing with sizes', sizes: `${startSizes.sized.join(' ')} · size chart · colours` },
  { kind: 'footwear', label: 'Footwear', sizes: `${startSizes.footwear.join(' ')} · foot length chart` },
  { kind: 'kids', label: 'Kids', sizes: `${startSizes.kids.join(' ')} · age chart` },
  { kind: 'one_size', label: 'One size', sizes: 'Saree, dupatta, jewellery, bags · colours only' },
]

/**
 * Start from what it is (products PR·2, mockup § Add a product): the name, then "What are you selling?". The kind starts
 * as the name's guess (kind.ts) until the merchant picks one; it sets the sizes and the size chart the editor opens
 * with. A shop that sells nothing sized sees the name only. What the server refuses is a toast, with the name kept.
 */
export function NewProductForm({ sized }: { sized: boolean }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [chosen, setChosen] = useState<Kind | null>(null)
  const kind = chosen ?? kindOf(title)
  const toast = useToast()
  const [pending, start] = useTransition()
  return (
    <form className="max-w-md space-y-4" onSubmit={(e) => {
      e.preventDefault()
      start(async () => {
        const r = await createProduct({ title, ...(sized ? { kind } : {}) })
        if (!r.ok) return toast.error(r.error)
        router.replace(`/console/products/${r.handle}`)
      })
    }}>
      <PageHeader title={'Add a product'} back={{ href: '/console/products', label: 'Products' }} />
      <div className="space-y-1.5">
        <label htmlFor="title" className="block text-sm font-medium">Name</label>
        <input id="title" autoFocus maxLength={140} value={title} placeholder="Linen kurta set"
          onChange={(e) => setTitle(e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-card px-3 text-base aria-invalid:border-danger-text" />
      </div>
      {sized && (
        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 text-sm font-medium">What are you selling?</legend>
          {CHOICES.map((c) => (
            <label key={c.kind} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 transition-colors duration-fast ${kind === c.kind ? 'border-ring bg-accent' : 'border-border hover:bg-accent'}`}>
              <input type="radio" name="kind" value={c.kind} checked={kind === c.kind} onChange={() => setChosen(c.kind)} />
              <span className="min-w-0"><span className="block text-sm font-medium">{c.label}</span><span className="block text-xs text-muted-foreground">{c.sizes}</span></span>
            </label>
          ))}
        </fieldset>
      )}
      <Button type="submit" disabled={pending || !title.trim()}>{pending ? 'Creating…' : 'Create draft'}</Button>
    </form>
  )
}
