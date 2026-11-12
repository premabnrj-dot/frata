'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/icons/icon'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast-context'
import { exampleNames, matchPhoto, MAX_PHOTOS_CHOSEN, photoIndex, placePhotos, type PhotoMatch, type PhotoTarget } from '@/domains/catalogue/import/photos'
import { cn } from '@/lib/utils'
import { Bar } from '../../import/_components/parts'
import { PhotoCard, type Card, type CardState } from './photo-card'
import { sendPhotos, type Batch, type Made } from './send-photos'

// Products › Add photos (plan 2026-11-12-product-import PI·2 · 8; mockup view "Photos"). Many photos chosen at once,
// each matched to a product by its file name in the browser (domains/catalogue/import/photos.ts); one that matches no
// product, or two, asks "Which product?". Add sends the matched ones; the rest wait for an answer or a skip.

/** `made`: uploaded and held until its product's other photos are (send-photos.ts). */
type Item = { key: string; file: File; match: PhotoMatch; productId: string | null; colour: string | null; state: CardState; p: number; preview: string | null; made: Made | null }

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif'
const isPhoto = (f: File) => /^image\/(jpeg|png|webp|heic|heif)$/.test(f.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)
const sameFile = (a: File, b: File) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified
const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`

export function PhotoMatcher({ tenantId, targets, back }: { tenantId: string; targets: PhotoTarget[]; back: { href: string; label: string } }) {
  const router = useRouter()
  const toast = useToast()
  const idx = useMemo(() => photoIndex(targets), [targets])
  // What each product held when the page opened, plus what this page added (the page's numbers never wait for a refresh).
  const [held] = useState(() => new Map(targets.map((t) => [t.id, t.photos])))
  const [added, setAdded] = useState<Map<string, number>>(new Map())
  const [items, setItems] = useState<Item[]>([])
  const [sending, setSending] = useState(false)
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const latest = useRef(items)
  latest.current = items
  // Read through refs: Try again runs a send made by an earlier render.
  const addedNow = useRef(added)
  addedNow.current = added
  const have = (id: string) => (held.get(id) ?? 0) + (addedNow.current.get(id) ?? 0)

  // Previews (only for photos that ask) are let go when the page goes.
  useEffect(() => () => { for (const it of latest.current) if (it.preview) URL.revokeObjectURL(it.preview) }, [])
  useEffect(() => {
    if (!sending) return
    const stay = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', stay)
    return () => window.removeEventListener('beforeunload', stay)
  }, [sending])

  const open = items.filter((it) => it.state !== 'added')
  const placed = placePhotos(open.map((it) => ({ key: it.key, productId: it.productId, n: it.match.n, name: it.file.name })), have)
  const sendable = open.filter((it) => it.productId && !placed.get(it.key)?.over && it.state !== 'uploading')
  const asking = open.filter((it) => !it.productId)
  const needPhotos = targets.filter((t) => have(t.id) === 0).length
  const products = new Set(items.flatMap((it) => (it.productId ? [it.productId] : []))).size

  function choose(files: FileList | File[] | null) {
    const list = [...(files ?? [])]
    if (!list.length) return
    const photos = list.filter(isPhoto).filter((f) => !latest.current.some((it) => it.state !== 'added' && sameFile(it.file, f)))
    const room = Math.max(0, MAX_PHOTOS_CHOSEN - latest.current.filter((it) => it.state !== 'added').length)
    const notPhotos = list.filter((f) => !isPhoto(f)).length
    if (photos.length > room) toast.error(`Up to ${MAX_PHOTOS_CHOSEN} photos at a time`, { sub: `${count(photos.length - room, 'photo')} left out` })
    else if (notPhotos) toast.error(notPhotos === 1 ? `${list.find((f) => !isPhoto(f))!.name} is not a photo` : `${notPhotos} files are not photos`, { sub: 'JPEG, PNG, WebP or HEIC' })
    const next = photos.slice(0, room).map((file): Item => {
      const match = matchPhoto(file.name, idx)
      return { key: crypto.randomUUID(), file, match, productId: match.productId, colour: match.colour, state: 'ready', p: 0, preview: match.productId ? null : URL.createObjectURL(file), made: null }
    })
    setItems((prev) => [...prev, ...next])
  }

  const patch = (keys: Set<string>, change: Partial<Item>) => setItems((prev) => prev.map((it) => (keys.has(it.key) ? { ...it, ...change } : it)))
  function pick(key: string, productId: string) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, productId, colour: null, state: it.state === 'failed' ? 'ready' : it.state } : it)))
  }
  function skipAsking() {
    for (const it of asking) if (it.preview) URL.revokeObjectURL(it.preview)
    const gone = new Set(asking.map((it) => it.key))
    setItems((prev) => prev.filter((it) => !gone.has(it.key)))
  }

  async function send() {
    const now = latest.current.filter((it) => it.state !== 'added')
    const place = placePhotos(now.map((it) => ({ key: it.key, productId: it.productId, n: it.match.n, name: it.file.name })), have)
    const todo = now.filter((it) => it.productId && !place.get(it.key)?.over && it.state !== 'uploading')
      .sort((a, b) => (place.get(a.key)?.i ?? 0) - (place.get(b.key)?.i ?? 0))
    if (!todo.length) return
    const batches = new Map<string, Batch>()
    for (const it of todo) {
      const b = batches.get(it.productId!) ?? { productId: it.productId!, photos: [] }
      b.photos.push({ key: it.key, file: it.file, colour: it.colour, made: it.made })
      batches.set(it.productId!, b)
    }
    setSending(true)
    patch(new Set(todo.map((it) => it.key)), { state: 'uploading', p: 0 })
    const failed = new Map<string, string>()
    let done = 0
    await sendPhotos([...batches.values()], tenantId, {
      progress: (key, p) => setItems((prev) => prev.map((it) => (it.key === key ? { ...it, p } : it))),
      added: (productId, keys) => {
        done += keys.length
        setAdded((m) => new Map(m).set(productId, (m.get(productId) ?? 0) + keys.length))
        patch(new Set(keys), { state: 'added', p: 1, made: null })
      },
      held: (key, made) => patch(new Set([key]), { state: 'ready', p: 0, made }),
      failed: (key, why) => { failed.set(key, why); patch(new Set([key]), { state: 'failed', p: 0 }) },
    }).catch((e) => { console.error('[photos page] send', e instanceof Error ? e.name : 'error'); for (const it of todo) if (!failed.has(it.key)) failed.set(it.key, 'We could not add the photos. Try again.') })
    setSending(false)
    router.refresh()
    if (failed.size) {
      const [why] = failed.values()
      toast.error(failed.size === 1 ? why! : `${count(failed.size, 'photo')} were not added`, {
        sub: failed.size === 1 ? (done ? `${count(done, 'photo')} added` : undefined) : why,
        action: { label: 'Try again', run: () => { void send() } },
      })
    } else if (done) toast.ok(`${count(done, 'photo')} added`)
  }

  const cards: Card[] = items.map((it) => ({
    key: it.key, name: it.file.name, preview: it.preview, product: it.productId ? idx.byId.get(it.productId) ?? null : null, colour: it.colour,
    place: placed.get(it.key) ?? null, state: it.state, p: it.p,
    suggest: it.match.productId === null ? it.match.candidates.flatMap((id) => idx.byId.get(id) ?? []) : [],
  })).sort((a, b) => Number(!a.product) - Number(!b.product) || (a.product && b.product ? a.product.title.localeCompare(b.product.title) || (a.place?.i ?? 0) - (b.place?.i ?? 0) : 0))
  const total = items.length
  const progress = items.filter((it) => it.state === 'added' || it.state === 'uploading')
  const examples = exampleNames(targets.find((t) => have(t.id) === 0) ?? targets[0])

  return (
    <>
      <PageHeader title="Add photos" back={back} meta={<span>{needPhotos === 1 ? '1 product needs photos' : `${needPhotos.toLocaleString('en-IN')} products need photos`}</span>}
        actions={<Button onClick={() => input.current?.click()} disabled={sending}>Choose photos</Button>} />
      <input ref={input} type="file" accept={ACCEPT} multiple className="sr-only" tabIndex={-1} aria-label="Choose photos" onChange={(e) => { choose(e.target.files); e.target.value = '' }} />
      <div className="grid gap-1 rounded-md bg-info px-3 py-2.5 text-sm text-info-text">
        <b>Name photos by SKU or product</b>
        <span className="font-mono text-xs [overflow-wrap:anywhere]">{examples.join(' · ')}</span>
      </div>
      {!total ? (
        <label
          onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); choose(e.dataTransfer.files) }}
          className={cn('grid cursor-pointer justify-items-center gap-2 rounded-lg border-2 border-dashed border-input bg-card px-4 py-10 text-center transition-colors duration-fast', over && 'bg-accent')}>
          <Icon name="upload" className="size-8 text-muted-foreground" />
          <b className="text-base">Drop photos</b>
          <span className="text-xs text-muted-foreground">JPEG, PNG, WebP or HEIC · up to {MAX_PHOTOS_CHOSEN} at a time</span>
          <input type="file" accept={ACCEPT} multiple className="sr-only" aria-label="Drop or choose photos" onChange={(e) => { choose(e.target.files); e.target.value = '' }} />
        </label>
      ) : (
        <Section id="chosen" title={`${count(total, 'photo')} · ${count(products, 'product')}`}
          action={asking.length > 0 ? <Badge tone="warn">{asking.length} not matched</Badge> : null}>
          <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (!sending) choose(e.dataTransfer.files) }} className="space-y-3">
            {sending && (
              <Bar done={items.filter((it) => it.state === 'added').length} total={progress.length} label={`${items.filter((it) => it.state === 'added').length} of ${progress.length} photos added`} />
            )}
            <ul aria-label="Photos" className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2.5">
              {cards.map((c) => <PhotoCard key={c.key} card={c} idx={idx} busy={sending} onPick={(id) => pick(c.key, id)} />)}
            </ul>
            <div className="flex flex-wrap justify-end gap-2">
              {asking.length > 0 && <Button variant="secondary" onClick={skipAsking} disabled={sending}>{asking.length === 1 ? 'Skip the 1 not matched' : `Skip the ${asking.length} not matched`}</Button>}
              {(sendable.length > 0 || sending) && <Button onClick={() => void send()} disabled={sending || !sendable.length}>{sending ? 'Adding photos' : `Add ${count(sendable.length, 'photo')}`}</Button>}
            </div>
          </div>
        </Section>
      )}
    </>
  )
}
