'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { createProduct } from '../actions'
import { PageHeader } from '@/components/layout/page-header'

/** One field: the name. Everything else is on the product's own page, which opens next. An empty or over-long name
 *  cannot be sent (the button waits, maxLength holds it), so what the server refuses is a failure after the button: a
 *  toast, with the name kept (§ Feedback 1). */
export function NewProductForm() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const toast = useToast()
  const [pending, start] = useTransition()
  return (
    <form className="max-w-md space-y-4" onSubmit={(e) => {
      e.preventDefault()
      start(async () => {
        const r = await createProduct({ title })
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
      <Button type="submit" disabled={pending || !title.trim()}>{pending ? 'Creating…' : 'Continue'}</Button>
    </form>
  )
}
