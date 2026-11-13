'use client'

import { useState } from 'react'
import { Button, Spinner } from '@/components/ui/button'
import { Badge, Tag } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Segmented } from '@/components/ui/segmented'
import { Dialog } from '@/components/ui/dialog'
import { Menu } from '@/components/ui/menu'
import { SaveBar } from '@/components/ui/unsaved'
import { ViewTabs } from '@/components/ui/view-tabs'
import { FieldError, fieldProps } from '@/components/ui/field-error'
import { FIELD, FIELD_BOX } from '@/components/ui/field'
import { Section } from '@/components/layout/section'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { Money, Numeric } from '@/components/data/numeric'
import { useToast } from '@/components/ui/toast-context'
import { paise } from '@/domains/money/paise'

// Neel's primitives in their states (fixtures/neel/page.tsx). Each block is one row of § Components.
export function Gallery() {
  const [on, setOn] = useState(true)
  const [seg, setSeg] = useState<'day' | 'week' | 'month'>('week')
  const [open, setOpen] = useState(false)
  const toast = useToast()
  return (
    <div className="space-y-6">
      <h1 className="font-display text-title font-semibold">Neel</h1>

      <Section title="Buttons" id="g-buttons">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Add product</Button>
          <Button variant="secondary">Import</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="destructive">Delete</Button>
          <Button size="sm" variant="secondary">Edit</Button>
          <Button reason="Add a price first">Publish</Button>
          <Button busy>Saving</Button>
          <Button variant="link">View in store</Button>
        </div>
      </Section>

      <Section title="Status and facts" id="g-badges">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="ok">Active</Badge><Badge tone="warn">To confirm</Badge><Badge tone="danger">Payment failed</Badge>
          <Badge tone="info">On the way</Badge><Badge tone="neutral">Draft</Badge>
          <Tag>Kurta set</Tag><Tag>Made to order</Tag>
        </div>
      </Section>

      <Section title="Views" id="g-tabs">
        <ViewTabs label="Products" tabs={[
          { href: '#all', label: 'All', count: 248, current: true }, { href: '#active', label: 'Active', count: 196, current: false },
          { href: '#draft', label: 'Draft', count: 31, current: false }, { href: '#low', label: 'Low stock', count: 12, current: false },
        ]} />
      </Section>

      <Section title="Choices" id="g-choices">
        <div className="flex flex-wrap items-center gap-6">
          <label className="inline-flex min-h-6 items-center gap-2 text-sm"><Switch on={on} onChange={setOn} label="Pay on delivery" /> Pay on delivery</label>
          <label className="inline-flex min-h-6 items-center gap-2 text-sm"><Switch on={false} onChange={() => {}} label="Off" disabled /> Off, locked</label>
          <Segmented label="Period" value={seg} options={[['day', 'Day'], ['week', 'Week'], ['month', 'Month']] as const} onPick={setSeg} />
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <label className="inline-flex min-h-6 items-center gap-2 text-sm"><input type="checkbox" /> Not ticked</label>
          <label className="inline-flex min-h-6 items-center gap-2 text-sm"><input type="checkbox" defaultChecked /> Ticked</label>
          <label className="inline-flex min-h-6 items-center gap-2 text-sm"><input type="checkbox" ref={(el) => { if (el) el.indeterminate = true }} /> Some</label>
          <label className="inline-flex min-h-6 items-center gap-2 text-sm"><input type="checkbox" disabled /> Locked</label>
          <label className="inline-flex min-h-6 items-center gap-2 text-sm"><input type="radio" name="g-r" defaultChecked /> Prepaid</label>
          <label className="inline-flex min-h-6 items-center gap-2 text-sm"><input type="radio" name="g-r" /> Pay on delivery</label>
        </div>
      </Section>

      <Section title="Fields" id="g-fields">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid content-start gap-1.5"><span className="text-label font-medium">Product name</span><input className={`${FIELD} w-full`} defaultValue="Sabz chanderi kurta set" /></label>
          <div className="grid content-start gap-1.5"><label htmlFor="g-price" className="text-label font-medium">Price</label>
            <input id="g-price" className={`${FIELD} w-full`} defaultValue="0" {...fieldProps('g-price', 'Add a price above ₹0.')} />
            <FieldError name="g-price" message="Add a price above ₹0." /></div>
          <label className="grid content-start gap-1.5"><span className="text-label font-medium">SKU</span><input className={`${FIELD} w-full font-mono`} defaultValue="KS-KUR-014" readOnly /></label>
          <label className="grid content-start gap-1.5"><span className="text-label font-medium">GSTIN</span><input className={`${FIELD} w-full`} defaultValue="" disabled placeholder="Locked while a filing runs" /></label>
          <label className="grid content-start gap-1.5"><span className="text-label font-medium">Category</span><select className={`${FIELD} w-full`} defaultValue="kurta"><option value="kurta">Kurta set</option><option value="saree">Saree</option></select></label>
          <label className="grid content-start gap-1.5"><span className="text-label font-medium">Description</span><textarea className={`${FIELD_BOX} w-full py-2`} rows={3} defaultValue="Hand block printed." /></label>
        </div>
      </Section>

      <section aria-labelledby="g-table-h" className="space-y-3"><h2 id="g-table-h" className="text-section font-semibold">Table</h2>
        <DataTable label="Products">
          <DataTableHead><th>Product</th><th>Status</th><th className="text-right">Price</th><th className="text-right">Stock</th></DataTableHead>
          <DataTableBody>
            <DataTableRow selected><Td cell="a">Sabz chanderi kurta set</Td><Td cell="d"><Badge tone="ok">Active</Badge></Td><Td cell="b" className="text-right"><Money paise={paise(249000)} /></Td><Td className="text-right"><Numeric>48</Numeric></Td></DataTableRow>
            <DataTableRow><Td cell="a">Mehr lehenga</Td><Td cell="d"><Badge tone="ok">Active</Badge></Td><Td cell="b" className="text-right"><Money paise={paise(1450000)} /></Td><Td className="text-right"><Tag>Made to order</Tag></Td></DataTableRow>
            <DataTableRow dimmed><Td cell="a">Indigo dupatta</Td><Td cell="d"><Badge>Archived</Badge></Td><Td cell="b" className="text-right"><Money paise={paise(89000)} /></Td><Td className="text-right"><Numeric>0</Numeric></Td></DataTableRow>
          </DataTableBody>
        </DataTable>
      </section>

      <Section title="Floating" id="g-floating" action={<Menu items={[{ label: 'Duplicate', onSelect: () => toast.ok('Duplicated.') }, { label: 'Archive', onSelect: () => {} }, { label: 'Delete', danger: true, onSelect: () => setOpen(true) }]} />}>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => toast.ok('Saved.')}>Show a toast</Button>
          <Button variant="secondary" onClick={() => toast.error('Could not reach the courier.', { action: { label: 'Try again', run: () => {} } })}>Show an error</Button>
          <Button variant="secondary" onClick={() => setOpen(true)}>Open a dialog</Button>
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Loading</span>
        </div>
        <SaveBar onSave={() => {}} onDiscard={() => {}} pending={false} count={3} keys="Ctrl+S" />
      </Section>

      <Dialog open={open} onClose={() => setOpen(false)} title="Delete Mehr lehenga?" description="It leaves your store and cannot come back."
        actions={<><Button variant="secondary" data-autofocus onClick={() => setOpen(false)}>Keep it</Button><Button variant="destructive" onClick={() => setOpen(false)}>Delete</Button></>} />
    </div>
  )
}
