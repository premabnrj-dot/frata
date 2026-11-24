'use client'

import dynamic from 'next/dynamic'
import { createContext, useContext, useMemo, useState } from 'react'

// =============================================================================
// FILE: src/app/(console)/console/_components/open-moment.tsx
//
// THE ONE BRAND MOMENT (frata-design-language rule 26; plan 2026-11-23-o2a-setup-card O2a·8, mockup § 2): the store just
// opened, so a layer over the whole frame draws the check, "<Store> is open", the address with Copy link, Share on
// WhatsApp and Go to Home — only in the session of the person who opened it. After it, until "Hide this card", Home
// shows the setup card's open state in place of Today. Home swaps the card for Today when the store opens, so this
// provider wraps both at the same place in the tree, and router.refresh() keeps its state. Nothing is stored (spec § O2:
// nothing stores "done"), so nothing carries it to another session, a reload or another store.
// =============================================================================

// In the popups' chunk, which "Open your store?" has already loaded: no chunk of its own (no entry in every page's loader).
const MomentLayer = dynamic(() => import('./setup/popups').then((m) => m.MomentLayer), { ssr: false })

type Moment = { opened: () => void; closed: () => void; hide: () => void }
const Ctx = createContext<Moment | null>(null)

/** For "Open your store?" (opened), closing for now (closed) and the open card (hide). Outside a provider: nothing. */
export const useOpenMoment = () => useContext(Ctx)

/**
 * `header` renders first. `open`: what Home shows while the store has just opened in this session (its header and the
 * setup card's open state), drawn on the server once the store is open; until it arrives, `header` and `children` stay.
 */
export function OpenMoment({ name, address, whatsapp, header, open, children }: {
  name: string; address: string; whatsapp: string
  header: React.ReactNode; open?: React.ReactNode; children: React.ReactNode
}) {
  const [just, setJust] = useState(false)
  const [layer, setLayer] = useState(false)
  const [hidden, setHidden] = useState(false)
  const value = useMemo(() => ({ opened: () => { setJust(true); setHidden(false); setLayer(true) }, closed: () => { setJust(false); setLayer(false) }, hide: () => setHidden(true) }), [])
  return (
    <Ctx.Provider value={value}>
      {just && !hidden && open ? open : <>{header}{children}</>}
      {layer && <MomentLayer name={name} address={address} whatsapp={whatsapp} onClose={() => setLayer(false)} />}
    </Ctx.Provider>
  )
}
