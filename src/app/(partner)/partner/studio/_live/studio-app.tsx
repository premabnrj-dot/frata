'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Icon } from '@/components/icons/icon'
import { Badge, Tag } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FieldError, fieldProps } from '@/components/ui/field-error'
import { ICON_BUTTON } from '@/components/ui/panel-rail'
import { useToast } from '@/components/ui/toast'
import { Agent, Person, StopCard, WorkLines } from '@/components/studio/chat-parts'
import { WorkbenchShell } from '@/components/studio/shell'
import { STUDIO_WORDS as W, refusedWords } from '@/domains/studio/words'
import type { Chat, ChatCard, ChatLine } from '@/lib/queries/studio'
import { applyAction, dismissAction, sendAction, stopAction } from '../actions'
import dynamic from 'next/dynamic'
// A card loads when the chat first shows one (the page's script pin).
const ProposalCard = dynamic(() => import('./card').then((m) => m.ProposalCard))

// =============================================================================
// STUDIO, LIVE (plan docs/plans/2026-11-22-v3a-runtime.md R7; workbench mockup 2026-11-22 screen 1; states mockup
// 2026-11-22, approved 2026-11-23): the shared shell with the person's own chat, the store's preview (state 7), the
// brand record in Design, and Code, Checks and Versions empty (state 8). The chat polls its rows route while a turn
// runs (3, 5, 10, 20 s), a keyset with each line once by id. Send, Stop, Apply and Not this are the page's actions;
// nothing here names a store, a session or a turn.
// =============================================================================

/** Drawn on the server and handed in as nodes (the page's script pin): `design`, the brand record as it is now
 *  (./brand-read.tsx); `empty`, the feed's, Code's, Checks' and Versions' empty states (states 2 and 8). */
export type Empties = { feed: React.ReactNode; code: React.ReactNode; checks: React.ReactNode; versions: React.ReactNode }
type Props = { chat: Chat; design: React.ReactNode; empty: Empties; store: string; version: number | null }
const BACKOFF = [3000, 3000, 5000, 5000, 10_000, 20_000]

function merge(lines: ChatLine[], more: ChatLine[]): ChatLine[] {
  const seen = new Set(lines.map((l) => l.id))
  return [...lines, ...more.filter((l) => !seen.has(l.id))].sort((a, b) => a.seq - b.seq)
}

export function StudioApp({ store, chat: first, design, empty, version }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [chat, setChat] = useState<Chat>(first)
  const [cards, setCards] = useState<Map<string, ChatCard>>(() => new Map(first.cards.map((c) => [c.id, c])))
  const [text, setText] = useState('')
  const [refused, setRefused] = useState<string | null>(null)
  const [dayLimit, setDayLimit] = useState(false)
  const [busyCard, setBusyCard] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const tries = useRef(0)
  const feedEnd = useRef<HTMLDivElement>(null)
  const working = chat.turn?.state === 'sending' || chat.turn?.state === 'running'

  // The poll: after the last line, while a turn runs; each answer resets the wait when something new came.
  const poll = useCallback(async () => {
    const after = chat.lines.at(-1)?.seq
    const r = await fetch(`/partner/studio/rows${after !== undefined ? `?after=${after}` : ''}`, { cache: 'no-store' }).catch(() => null)
    if (!r?.ok) return false
    const next = (await r.json()) as Chat
    if (next.sessionId !== chat.sessionId) { setChat(next); setCards(new Map(next.cards.map((c) => [c.id, c]))); return true }
    setChat((c) => ({ ...next, lines: merge(c.lines, next.lines) }))
    setCards((m) => { const n = new Map(m); for (const c of next.cards) n.set(c.id, c); return n })
    return next.lines.length > 0 || next.turn?.state !== chat.turn?.state
  }, [chat.lines, chat.sessionId, chat.turn?.state])
  useEffect(() => {
    if (!working) { tries.current = 0; return }
    const t = setTimeout(async () => {
      const moved = await poll()
      tries.current = moved ? 0 : Math.min(tries.current + 1, BACKOFF.length - 1)
      setChat((c) => ({ ...c })) // schedule the next read
    }, BACKOFF[tries.current])
    return () => clearTimeout(t)
  }, [working, poll, chat])

  // The newest line in view whenever the chat grows or the turn changes state.
  const turnState = chat.turn?.state
  useEffect(() => { feedEnd.current?.scrollIntoView({ block: 'end' }) }, [chat.lines.length, turnState, refused])

  const send = (words: string) => start(async () => {
    setRefused(null)
    const r = await sendAction({ text: words })
    if (!r.ok) {
      const line = refusedWords(r.why)
      setDayLimit(r.why === 'person_day' || r.why === 'platform_day')
      // A Send that became a turn (and failed on our side) is in the chat now: the box is cleared for the next one.
      if (r.why === 'start' || r.why === 'send' || r.why === 'budget') setText('')
      if (line) setRefused(line)
      // start, send, budget: the turn's own card says so (state 5); an error that left no turn, a toast.
      else if (r.why === 'error') toast.error(W.failed.title, { sub: W.failed.line })
      await poll()
      return
    }
    setText('')
    setDayLimit(false)
    tries.current = 0
    await poll()
  })
  const stop = () => start(async () => { await stopAction(); await poll() })
  const lastAsk = [...chat.lines].reverse().find((l) => l.kind === 'person')?.text ?? ''

  const apply = (c: ChatCard) => start(async () => {
    setBusyCard(c.id)
    const r = await applyAction({ id: c.id, version })
    setBusyCard(null)
    setCards((m) => new Map(m).set(c.id, r.ok ? { ...c, state: 'applied', reason: null } : { ...c, state: 'refused', reason: r.error }))
    if (r.ok) { toast.ok('Applied to Brand.'); router.refresh() }
  })
  const dismiss = (c: ChatCard) => start(async () => {
    const r = await dismissAction({ id: c.id })
    if (r.ok) setCards((m) => new Map(m).set(c.id, { ...c, state: 'dismissed' }))
  })

  const feed = () => (
    <div className="grid content-start gap-3 overflow-auto p-3" aria-live="polite" aria-relevant="additions">
      {chat.lines.length === 0 && !working ? empty.feed : null}
      {chat.lines.map((l) => {
        if (l.kind === 'person') return <Person key={l.id}>{l.text}</Person>
        if (l.kind === 'agent') return <Agent key={l.id}><p className="whitespace-pre-wrap">{l.text}</p></Agent>
        const card = l.proposalId ? cards.get(l.proposalId) : undefined
        return card ? <Agent key={l.id}><ProposalCard card={card} busy={busyCard === card.id && pending} onApply={() => apply(card)} onDismiss={() => dismiss(card)} onReload={() => router.refresh()} /></Agent> : null
      })}
      {chat.turn && working
        ? <Agent><WorkLines lines={chat.turn.work.some((w) => !w.done) ? chat.turn.work : [...chat.turn.work, { words: 'Working', done: false }]} /></Agent>
        : null}
      {chat.turn?.state === 'paused'
        ? <Agent><StopCard tone="warn" title={W.paused.title} line={W.paused.line} action={<Button size="sm" variant="secondary" busy={pending} onClick={() => send('Continue')}>{W.paused.action}</Button>} /></Agent>
        : null}
      {chat.turn?.state === 'paused' && dayLimit ? <Agent><StopCard tone="warn" title={W.day.title} line={W.day.line} /></Agent> : null}
      {chat.turn?.state === 'failed'
        ? <Agent><StopCard tone="bad" title={W.failed.title} line={W.failed.line} action={lastAsk ? <Button size="sm" variant="secondary" busy={pending} onClick={() => send(lastAsk)}>{W.failed.action}</Button> : undefined} /></Agent>
        : null}
      <div ref={feedEnd} aria-hidden="true" />
    </div>
  )

  const composer = () => (
    <form className="grid gap-2 border-t border-line-soft px-3 py-2.5" onSubmit={(e) => { e.preventDefault(); if (!working && text.trim()) send(text) }}>
      {working ? <p className="text-label text-muted-foreground">{W.working}</p> : null}
      <label className="flex items-center gap-1.5 rounded-md border border-input bg-card py-1 pr-1 pl-2.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-halo">
        <span className="sr-only">Ask for a change</span>
        <input name="ask" value={text} onChange={(e) => { setText(e.target.value); if (refused) setRefused(null) }} maxLength={2000} placeholder="Ask for a change"
          {...fieldProps('ask', refused)} className="min-h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-3" />
        {working
          ? <Button type="button" size="sm" variant="secondary" busy={pending} onClick={stop}>Stop</Button>
          : <Button type="submit" size="sm" busy={pending}>Send</Button>}
      </label>
      <FieldError name="ask" message={refused} />
    </form>
  )

  return (
    <WorkbenchShell slots={{
      top: () => (
        <header className="flex min-w-0 items-center gap-2.5 border-b border-border bg-side px-3">
          <Link href="/partner" aria-label="Back to Clients" className={ICON_BUTTON}><Icon name="back" className="size-4" /></Link>
          <span className="truncate font-semibold">{store}</span>
        </header>
      ),
      chat: { feed, composer, railNote: working ? 'Working' : undefined },
      preview: () => (
        <>
          <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-border bg-card px-2 py-1.5">
            <Tag>{W.previewTitle}</Tag><Badge tone="neutral">{W.previewTag}</Badge>
          </div>
          <iframe title={W.previewTitle} src="/console/preview" className="h-full w-full border-0 bg-card" />
        </>
      ),
      inspector: {
        design: () => design,
        code: () => empty.code,
        checks: () => empty.checks,
        versions: () => empty.versions,
      },
    }} />
  )
}

