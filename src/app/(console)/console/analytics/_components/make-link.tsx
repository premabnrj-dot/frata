'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { shopLink, type Preset } from '@/domains/analytics/link'

// =============================================================================
// MAKE A LINK (A·1, the page's one primary action; mockup § Make a link): where it will be shared, which page opens,
// a name. Out comes the link with Copy, and what its orders will show as. The link is built by the domain's one
// builder (shopLink: URL + URLSearchParams, the shop's own origin only); pages come from the server's lists. "A
// creator" goes to Offers, where a creator's own code and link live, so orders count as theirs.
// =============================================================================

type Target = { handle: string; title: string }
const CHOICES: (Preset | 'creator')[] = ['instagram_bio', 'instagram_story', 'whatsapp_broadcast', 'meta_ad', 'google_ad', 'creator']
const CHOICE_LABEL: Record<Preset | 'creator', string> = {
  instagram_bio: 'Instagram bio', instagram_story: 'Instagram story', whatsapp_broadcast: 'WhatsApp broadcast',
  meta_ad: 'Instagram or Facebook ad', google_ad: 'Google ad', creator: 'A creator',
}

export function MakeLink({ origin, open, products, collections, showsAs: shows }: { origin: string; open: boolean; products: Target[]; collections: Target[]; showsAs: Record<Preset, string> }) {
  const [shown, setShown] = useState(false)
  const [choice, setChoice] = useState<Preset | 'creator'>('instagram_bio')
  const [page, setPage] = useState('/')
  const [name, setName] = useState('')
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null)
  const link = useMemo(() => {
    if (choice === 'creator') return null
    try { return shopLink(origin, page, { preset: choice, campaign: name }) } catch { return null }
  }, [origin, page, choice, name])
  const showsAs = choice === 'creator' ? null : shows[choice]

  async function copy() {
    if (!link) return
    try { await navigator.clipboard.writeText(link); setCopied('yes') } catch { setCopied('no') }
  }

  return (
    <>
      <Button onClick={() => { setShown(true); setCopied(null) }}>Make a link</Button>
      <Dialog open={shown} onClose={() => setShown(false)} title="Make a link"
        actions={<Button variant="secondary" data-autofocus onClick={() => setShown(false)}>Done</Button>}>
        {/* The body only while open: its page list is a third of the page's HTML otherwise (speed review A1·7). */}
        {!shown ? null : !open ? (
          <p className="text-sm">Your shop opens to shoppers first; then a link brings them to it.</p>
        ) : (
          <div className="grid gap-4">
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Where will you share it?</legend>
              <div className="flex flex-wrap gap-2">
                {CHOICES.map((c) => (
                  <label key={c} className={`inline-flex min-h-9 cursor-pointer items-center rounded-full border px-3 text-sm ${choice === c ? 'border-foreground bg-foreground text-background' : 'border-input'}`}>
                    <input type="radio" name="share" value={c} checked={choice === c} onChange={() => { setChoice(c); setCopied(null) }} className="sr-only" />
                    {CHOICE_LABEL[c]}
                  </label>
                ))}
              </div>
            </fieldset>
            {choice === 'creator' ? (
              <p className="text-sm">A creator shares their own code&apos;s link, so orders count as theirs. <Link href="/console/offers" className="underline">Add a creator code on an offer</Link>.</p>
            ) : (
              <>
                <div className="grid gap-1">
                  <label htmlFor="link-page" className="text-sm font-medium">Which page opens?</label>
                  <select id="link-page" value={page} onChange={(e) => { setPage(e.target.value); setCopied(null) }} className="h-10 rounded-md border border-input bg-card px-3 text-sm md:h-9">
                    <option value="/">Your shop&apos;s home</option>
                    {collections.length ? <optgroup label="Collections">{collections.map((c) => <option key={c.handle} value={`/collections/${c.handle}`}>{c.title}</option>)}</optgroup> : null}
                    {products.length ? <optgroup label="Products">{products.map((p) => <option key={p.handle} value={`/products/${p.handle}`}>{p.title}</option>)}</optgroup> : null}
                  </select>
                </div>
                <div className="grid gap-1">
                  <label htmlFor="link-name" className="text-sm font-medium">Name it, so you can tell posts apart</label>
                  <input id="link-name" value={name} maxLength={50} onChange={(e) => { setName(e.target.value); setCopied(null) }} placeholder="Diwali drop" className="h-10 rounded-md border border-input bg-card px-3 text-sm md:h-9" />
                  <span className="text-xs text-muted-foreground">Optional. Shown as the campaign on Analytics.</span>
                </div>
                {link ? (
                  <>
                    <output htmlFor="link-page link-name" className="block break-all rounded-md bg-muted p-3 font-mono text-xs">{link}</output>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button onClick={() => void copy()}>Copy link</Button>
                      <span role="status" className="text-sm text-muted-foreground">
                        {copied === 'yes' ? 'Copied.' : copied === 'no' ? 'Copy it by hand: your browser did not allow it.' : <>Orders from it show as <b className="text-foreground">{showsAs}</b>.</>}
                      </span>
                    </div>
                  </>
                ) : null}
              </>
            )}
          </div>
        )}
      </Dialog>
    </>
  )
}
