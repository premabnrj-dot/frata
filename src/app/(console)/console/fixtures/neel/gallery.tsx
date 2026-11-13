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
import { Banner } from '@/components/ui/banner'
import { Empty, Locked, NoMatch, Skeleton } from '@/components/ui/empty'
import { Facts, StatTile } from '@/components/data/facts'
import { ActivityFeed } from '@/components/data/activity'
import { Steps } from '@/components/ui/steps'
import { CopyField } from '@/components/ui/copy-field'
import { LongJob } from '@/components/ui/long-job'
import { CodeInput, PinField, Stepper, UnitField } from '@/components/ui/unit-field'
import { DropZone } from '@/components/ui/drop-zone'
import { ConfirmDelete } from '@/components/ui/confirm-delete'
import { SearchPicker } from '@/components/ui/search-picker'
import { DateField, TimeField } from '@/components/ui/date-field'

// Neel's primitives in their states (fixtures/neel/page.tsx). Each block is one row of § Components.
export function Gallery({ today }: { today: string }) {
  const [on, setOn] = useState(true)
  const [seg, setSeg] = useState<'day' | 'week' | 'month'>('week')
  const [open, setOpen] = useState(false)
  const toast = useToast()
  const [qty, setQty] = useState(2)
  const [code, setCode] = useState('4819')
  const [day, setDay] = useState<string | null>(null)
  const [time, setTime] = useState('10:00')
  const [picked, setPicked] = useState('')
  const [many, setMany] = useState(false)
  const [few, setFew] = useState(false)
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
          <label className="grid content-start gap-1.5"><span className="text-label font-medium">Kind</span><select className={`${FIELD} w-full`} defaultValue="kurta"><option value="kurta">Kurta set</option><option value="saree">Saree</option></select></label>
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


      <h2 className="font-display text-title font-semibold">More components</h2>

      <Section title="Banners" id="g-banners">
        <div className="grid gap-2">
          <Banner tone="bad" title="Payment due" action={<a href="#g-banners">Pay now</a>}>Pay ₹4,999 by 18 Nov to keep your store open.</Banner>
          <Banner tone="warn" title="Trial ends in 3 days" action={<a href="#g-banners">Choose a plan</a>} />
          <Banner tone="info" title="You're offline">Changes save when you're back.</Banner>
          <Banner tone="support" title="Frrata support is in your console" action={<a href="#g-banners">End visit</a>}>Riya from Frrata · 22 min left</Banner>
        </div>
      </Section>

      <Section title="Empty, locked, loading" id="g-empty">
        <div className="grid gap-2">
          <Empty picto="store" title="No products yet"><Button size="sm" variant="secondary">Import</Button><Button size="sm">Add product</Button></Empty>
          <NoMatch title="No product matches “silk”"><Button variant="link">Clear search</Button></NoMatch>
          <Locked title="Only the owner can change payments" who="Ask Riya Mehta" />
          <Skeleton />
        </div>
      </Section>

      <Section title="Facts and activity" id="g-facts">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-3.5">
            <Facts rows={[['Placed', 'Today, 10:06 pm'], ['Payment', <Tag key="t">COD</Tag>], ['Ship to', 'Sneha, 14 MG Road, Thiruvananthapuram 695001'], ['AWB', <span key="a" className="font-mono text-small">1490023381</span>]]} />
            <StatTile label="Kept after returns" value={<Money paise={paise(18432000)} />} change={{ words: '↑ 12% on last month', tone: 'ok' }} />
          </div>
          <ActivityFeed label="Order activity" items={[
            { key: 'c', what: 'Confirmed', detail: 'by Riya', when: 'Today, 10:12 pm' },
            { key: 'p', what: 'Placed', detail: 'by the shopper · COD', when: 'Today, 10:06 pm' },
            { key: 'n', what: 'Note', detail: '“Call before delivery” · Riya', when: 'Today, 10:15 pm' },
          ]} />
        </div>
      </Section>

      <Section title="Copy, steps, long jobs" id="g-copy">
        <div className="grid gap-3">
          <CopyField value="kesarstudio.in/l/insta-bio" label="link" />
          <Steps label="Import" steps={['File', 'Check', 'Write', 'Done']} current={2} />
          <LongJob title="Importing 1,240 products" done={640} total={1240} note="3 rows to fix · keep this page open" action={<Button size="sm" variant="secondary">Pause</Button>} />
        </div>
      </Section>

      <Section title="Inputs with a unit" id="g-units">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid content-start gap-1.5"><span className="text-label font-medium">COD fee</span><UnitField unit="₹" defaultValue="49" inputMode="decimal" /></label>
          <label className="grid content-start gap-1.5"><span className="text-label font-medium">Discount</span><UnitField unit="%" at="end" defaultValue="10" inputMode="decimal" /></label>
          <label className="grid content-start gap-1.5"><span className="text-label font-medium">Phone</span><UnitField unit="+91" defaultValue="98450 12345" inputMode="tel" /></label>
          <label className="grid content-start gap-1.5"><span className="text-label font-medium">PIN code</span><PinField defaultValue="302001" place="Jaipur, Rajasthan" /></label>
          <div className="grid content-start gap-1.5"><span className="text-label font-medium">Quantity</span><Stepper label="Quantity" value={qty} onChange={setQty} min={1} /></div>
          <div className="grid content-start gap-1.5"><span className="text-label font-medium">Code sent to your phone</span><CodeInput label="Code sent to your phone" value={code} onChange={setCode} /></div>
        </div>
      </Section>

      <Section title="Pickers" id="g-pickers">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid content-start gap-1.5"><span className="text-label font-medium">Category</span>
            <SearchPicker label="Category" options={[{ id: 'k1', label: 'Kurta sets', meta: 'Apparel › Women' }, { id: 'k2', label: 'Kurtas', meta: 'Apparel › Men' }, { id: 's', label: 'Sarees', meta: 'Apparel › Women' }]}
              onPick={(o) => setPicked(o.label)} onCreate={(t) => setPicked(`new: ${t}`)} />
            {picked ? <span className="text-small text-muted-foreground">Picked {picked}</span> : null}</div>
          <label className="grid content-start gap-1.5"><span className="text-label font-medium">When it runs out</span><select className={`${FIELD} w-full`} defaultValue="stop"><option value="stop">Stop selling</option><option value="pre">Take pre-orders</option></select></label>
          <div className="grid content-start gap-1.5"><span className="text-label font-medium">Starts</span><DateField label="Starts" value={day} onChange={setDay} today={today} /></div>
          <div className="grid content-start gap-1.5"><span className="text-label font-medium">At</span><TimeField label="Starts at" value={time} onChange={setTime} /></div>
        </div>
      </Section>

      <Section title="Upload and confirm" id="g-upload">
        <div className="grid gap-3 md:grid-cols-2">
          <DropZone noun="photos" accept="image/*" hint="JPEG, PNG, WebP · up to 20 MB" onFiles={() => {}}
            uploads={[{ name: 'kurta-front.jpg', loaded: 4.1 * 1048576, size: 6.6 * 1048576 }, { name: 'scan.heic', error: "This file type can't be used. Use JPEG or PNG." }]} />
          <div className="flex flex-wrap content-start gap-2"><Button variant="destructive" onClick={() => setFew(true)}>Delete 2 drafts</Button><Button variant="destructive" onClick={() => setMany(true)}>Delete 12 products</Button></div>
        </div>
      </Section>
      <ConfirmDelete open={few} count={2} noun={['draft', 'drafts']} consequence="Banarasi silk saree and Gulnar jhumka earrings. This can't be undone." keep="Keep them" onConfirm={() => setFew(false)} onClose={() => setFew(false)} />
      <ConfirmDelete open={many} count={12} noun={['product', 'products']} consequence="This can't be undone." onConfirm={() => setMany(false)} onClose={() => setMany(false)} />
      <Dialog open={open} onClose={() => setOpen(false)} title="Delete Mehr lehenga?" description="It leaves your store and cannot come back."
        actions={<><Button variant="secondary" data-autofocus onClick={() => setOpen(false)}>Keep it</Button><Button variant="destructive" onClick={() => setOpen(false)}>Delete</Button></>} />
    </div>
  )
}
