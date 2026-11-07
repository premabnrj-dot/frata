'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
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
  useShortcuts(enabled, { next: () => setRow((r) => r + 1), previous: () => setRow((r) => Math.max(0, r - 1)), confirm: () => say('confirm'), help: () => setKeys(true) })
  return (
    <div className="grid gap-6">
      <ViewTabs label="Views" tabs={[{ href: '?t=a', label: 'To confirm', count: 1043, current: true }, { href: '?t=b', label: 'To pack', count: 3, current: false }, { href: '?t=c', label: 'Not paid online', count: 2, current: false, apart: true }]} />
      <p className="flex items-center gap-1">Bill of supply <InfoTip about="bill of supply">What a shop without a GSTIN gives instead of a tax invoice.</InfoTip></p>
      <div className="flex gap-2">
        <Button onClick={() => setCancel(true)}>Cancel order…</Button>
        <Menu items={[{ label: 'Hold', onSelect: () => say('hold') }, { label: 'Print invoice', onSelect: () => say('print') }, { label: 'Cancel order', onSelect: () => say('cancel'), danger: true }]} />
        <Button variant="secondary" onClick={() => toast({ text: 'KS-1001 confirmed.', undo: async () => { say('undo'); return { ok: true } } })}>Confirm</Button>
      </div>
      <input aria-label="Search" placeholder="Search" className="h-10 rounded-md border border-input px-3 md:h-9" />
      <p data-testid="row">row {row}</p>
      <ol data-testid="log">{log.map((l, i) => <li key={i}>{l}</li>)}</ol>
      <Dialog open={cancel} onClose={() => { setCancel(false); say('kept') }} title="Cancel KS-1001?" description="The stock goes back. This cannot be undone."
        actions={<><Button autoFocus variant="secondary" onClick={() => { setCancel(false); say('kept') }}>Keep the order</Button><Button variant="destructive" onClick={() => { setCancel(false); say('cancelled') }}>Cancel order</Button></>} />
      <KeySheet open={keys} onClose={() => setKeys(false)} enabled={enabled} onEnabled={setEnabled} />
    </div>
  )
}

export function Primitives() {
  return <Toaster><Board /></Toaster>
}
