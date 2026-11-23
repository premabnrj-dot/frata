import { after, NextResponse } from 'next/server'
import { requireStudio } from '@/lib/studio/with-studio'
import { studioChat } from '@/lib/queries/studio'
import { pollAdvance } from '@/lib/studio/sessions'
import { errName } from '@/lib/log'

// Studio's chat poll (plan docs/plans/2026-11-22-v3a-runtime.md § Advance, R7): the person's own chat after a keyset,
// private and never stored; then, after the answer, their own open turn advanced (no id from the request: the turn is
// read under their bind; skipped when an advance read it in the last 5 s). maxDuration 30: an answer send needs 15 s of
// room after a read (the plan's 10 s could never answer a round; Deviations).
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const NO_STORE = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  // Read by this page's own script only: a cross-site request (a link elsewhere) neither reads nor advances anything
  // (security review of R7, LOW-3; the advance's lease already skips repeats within 5 s).
  if (request.headers.get('sec-fetch-site') === 'cross-site') return NextResponse.json({ closed: true }, { status: 403, headers: NO_STORE })
  const auth = await requireStudio()
  if (!auth.ok) return NextResponse.json({ closed: true }, { status: 403, headers: NO_STORE })
  const url = new URL(request.url)
  // The tab's own store, compared only (never used): another store now means the person switched in another tab.
  if (url.searchParams.get('store') !== auth.tenantId) return NextResponse.json({ moved: true }, { status: 409, headers: NO_STORE })
  const raw = url.searchParams.get('after')
  const after = raw && /^\d{1,15}$/.test(raw) ? Number(raw) : null
  try {
    const chat = await studioChat(auth, after)
    if (chat.turn?.state === 'running' || chat.turn?.state === 'sending') after_(() => pollAdvance(auth))
    return NextResponse.json(chat, { headers: NO_STORE })
  } catch (err) {
    console.error('[studio] rows', errName(err))
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE })
  }
}

const after_ = (work: () => Promise<void>) => { try { after(work) } catch { /* not in a request */ } }
