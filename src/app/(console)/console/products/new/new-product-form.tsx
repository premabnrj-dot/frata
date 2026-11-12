'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createProduct } from '../actions'
import { PageHeader } from '@/components/layout/page-header'

/** One field: the name. Everything else is on the product's own page, which opens next. */
export function NewProductForm() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <form className="max-w-md space-y-4" onSubmit={(e) => {
      e.preventDefault()
      start(async () => {
        const r = await createProduct({ title })
        if (!r.ok) return setError(r.error)
        router.replace(`/console/products/${r.handle}`)
      })
    }}>
      <PageHeader title={'Add a product'} back={{ href: '/console/products', label: 'Products' }} />
      <div className="space-y-1.5">
        <label htmlFor="title" className="block text-sm font-medium">Name</label>
        <input id="title" autoFocus maxLength={140} value={title} placeholder="Linen kurta set" aria-invalid={!!error || undefined}
          onChange={(e) => { setTitle(e.target.value); setError(null) }}
          className="h-10 w-full rounded-md border border-input bg-card px-3 text-base aria-invalid:border-danger-text" />
        <p role="alert" className="min-h-5 text-sm text-danger-text">{error}</p>
      </div>
      <Button type="submit" disabled={pending || !title.trim()}>{pending ? 'Creating…' : 'Continue'}</Button>
    </form>
  )
}
