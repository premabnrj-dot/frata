'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { button } from '@/components/ui/button'
import { ConfirmDelete } from '@/components/ui/confirm-delete'
import { Menu, type MenuItem } from '@/components/ui/menu'
import { useToast } from '@/components/ui/toast'
import type { Status } from '@/domains/catalogue/availability'
import { bulkDelete, bulkStatus, duplicateProduct } from '../bulk-actions'

/**
 * The editor's header actions (Neel N2, mockup: "Preview · More"): Preview opens the product as a shopper sees it; More
 * holds Duplicate (copies what is saved), View in shop (a live product), and Delete draft (a draft never live) or Archive.
 * Share stays its own button beside them (its sheet is a dialog of its own).
 */
export function ProductMore({ id, title, handle, status, everLive, shopUrl, dirty }: {
  id: string; title: string; handle: string; status: Status; everLive: boolean; shopUrl: string; dirty: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const live = status === 'active' || status === 'unlisted'
  const items: MenuItem[] = [
    { label: dirty ? 'Duplicate what is saved' : 'Duplicate', onSelect: () => start(async () => {
      const r = await duplicateProduct(id)
      if (!r.ok) { toast.error(r.error); return }
      toast.ok('Copied as a draft.'); router.push(`/console/products/${r.handle}`)
    }) },
    ...(live ? [{ label: 'View in shop', href: shopUrl }] : []),
    ...(status === 'draft' && !everLive
      ? [{ label: 'Delete draft', danger: true, onSelect: () => { setError(null); setAsking(true) } }]
      : status !== 'archived' ? [{ label: 'Archive', danger: true, onSelect: () => start(async () => {
        const r = await bulkStatus([id], 'archived')
        if (!r.ok) { toast.error(r.error); return }
        toast.ok('Archived. Its page says it is no longer available.'); router.refresh()
      }) }] : []),
  ]
  return (
    <>
      <Link href={`/console/preview/products/${handle}`} className={button({ variant: 'secondary' })}>Preview</Link>
      <Menu items={items} variant="ghost" />
      <ConfirmDelete open={asking} count={1} noun={['draft', 'drafts']} consequence={<>“{title}” goes for good, with its photos.</>} keep="Keep it" busy={pending} error={error}
        onClose={() => setAsking(false)}
        onConfirm={() => start(async () => {
          const r = await bulkDelete([id])
          if (!r.ok) { setError(r.error); return }
          if (!r.deleted) { setError(r.kept[0] ? `It can't be deleted: ${r.kept[0].why}. Archive it instead.` : 'It could not be deleted.'); return }
          setAsking(false); toast.ok('Deleted.'); router.push('/console/products')
        })} />
    </>
  )
}
