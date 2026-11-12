'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FieldError, useFieldErrors } from '@/components/ui/field-error'
import { InfoTip } from '@/components/ui/info-tip'
import { KeySheet } from '@/components/ui/key-sheet'
import { Menu } from '@/components/ui/menu'
import { Toaster, useToast } from '@/components/ui/toast'
import { useShortcuts, useShortcutsEnabled } from '@/components/ui/use-shortcuts'
import { ViewTabs } from '@/components/ui/view-tabs'

// TEST-ONLY (see page.tsx): each primitive once, with a log the flow reads.
function Board() {
  const [log, setLog] = useState<string[]>([])
  const say = (s: string) => setLog((l) => [...l, s])
  const [cancel, setCancel] = useState(false)
  const [keys, setKeys] = useState(false)
  const [row, setRow] = useState(0)
  const [enabled, setEnabled] = useShortcutsEnabled()
  const toast = useToast()
  const fields = useFieldErrors()
  const [publish, setPublish] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  useShortcuts(enabled, { next: () => setRow((r) => r + 1), previous: () => setRow((r) => Math.max(0, r - 1)), confirm: () => say('confirm'), help: () => setKeys(true) })
  return (
    <div className="grid gap-6">
      <ViewTabs label="Views" tabs={[{ href: '?t=a', label: 'To confirm', count: 1043, current: true }, { href: '?t=b', label: 'To pack', count: 3, current: false }, { href: '?t=c', label: 'Not paid online', count: 2, current: false, apart: true }]} />
      <p className="flex items-center gap-1">Bill of supply <InfoTip about="bill of supply">What a shop without a GSTIN gives instead of a tax invoice.</InfoTip></p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setCancel(true)}>Cancel order…</Button>
        <Menu items={[{ label: 'Hold', onSelect: () => say('hold') }, { label: 'Print invoice', onSelect: () => say('print') }, { label: 'Cancel order', onSelect: () => setCancel(true), danger: true }]} />
        <Button variant="secondary" onClick={() => toast({ text: 'KS-1001 confirmed.', undo: async () => { say('undo'); return { ok: true } } })}>Confirm</Button>
        <Button variant="secondary" onClick={() => toast({ text: 'KS-1002 confirmed.', undo: async () => { await new Promise((r) => setTimeout(r, 800)); say('slow undo'); return { ok: false, error: 'Already packed — cancel it instead.' } } })}>Confirm slowly</Button>
        <Button variant="secondary" onClick={() => toast({ text: 'KS-1003 on hold.' })}>Hold</Button>
        <Button variant="secondary" onClick={() => toast.error('Not saved.', { sub: 'Nothing was changed.', action: { label: 'Try again', run: () => { say('retried') } } })}>Save fails</Button>
        <Button variant="secondary" onClick={() => setPublish(true)}>Publish…</Button>
      </div>
      <form noValidate className="grid max-w-sm gap-3" onSubmit={(e) => {
        e.preventDefault()
        const d = new FormData(e.currentTarget)
        fields.set({ price: Number(d.get('price')) > 0 ? null : 'More than ₹0.', hsn: /^(\d{4}|\d{6}|\d{8})$/.test(String(d.get('hsn'))) ? null : '4, 6 or 8 digits.' })
      }}>
        <label className="grid gap-1 text-sm">Price<input name="price" defaultValue="0" onChange={() => fields.clear('price')} {...fields.props('price')} className="h-10 rounded-md border border-input px-3 aria-invalid:border-danger-mark md:h-9" /></label>
        <FieldError name="price" message={fields.errors.price} />
        <label className="grid gap-1 text-sm">HSN code<input name="hsn" defaultValue="62" onChange={() => fields.clear('hsn')} {...fields.props('hsn')} className="h-10 rounded-md border border-input px-3 aria-invalid:border-danger-mark md:h-9" /></label>
        <FieldError name="hsn" message={fields.errors.hsn} />
        <Button type="submit" variant="secondary">Save product</Button>
      </form>
      <input aria-label="Search" placeholder="Search" className="h-10 rounded-md border border-input px-3 md:h-9" />
      <p data-testid="row">row {row}</p>
      <ol data-testid="log">{log.map((l, i) => <li key={i}>{l}</li>)}</ol>
      <Dialog open={cancel} onClose={() => { setCancel(false); say('kept') }} title="Cancel KS-1001?" description="The stock goes back. This cannot be undone."
        // The safe button SECOND, so the test proves focus goes to the marked one, not merely the first.
        actions={<><Button variant="destructive" onClick={() => { setCancel(false); say('cancelled') }}>Cancel order</Button><Button data-autofocus variant="secondary" onClick={() => { setCancel(false); say('kept') }}>Keep the order</Button></>} />
      <Dialog open={publish} onClose={() => { setPublish(false); setPublishError(null) }} title="Publish your look?" description="Shoppers see it at once." error={publishError}
        actions={<><Button data-autofocus variant="secondary" onClick={() => { setPublish(false); setPublishError(null) }}>Not now</Button>
          <Button onClick={() => { if (!publishError) setPublishError("Couldn't publish. Your draft is safe."); else { setPublish(false); setPublishError(null); toast.ok('Published.') } }}>{publishError ? 'Try again' : 'Publish'}</Button></>} />
      <KeySheet open={keys} onClose={() => setKeys(false)} enabled={enabled} onEnabled={setEnabled} />
    </div>
  )
}

export function Primitives() {
  return <Toaster><Board /></Toaster>
}
