// The checkout's two marks (P2 mockup docs/mockups/2026-11-16-p2-checkout.html, screens 4–5: `.s-msg` and `.s-err`): an
// alert triangle before a failure or a field's error, an info ring before "Something changed". The drawings are
// NOTE_MARKS (note-marks.tsx), sent once by the brand frame's server HTML; this only points at one. Used by the console's
// preview; checkout draws the same pointer inline (its first load has no room for another module). Sized, stroked and shown by BRAND_CSS (`.ck-ic-sm`, `.ck-msg`, `.ck-fe`): hidden on a
// theme shop, whose checkout keeps its look.

export function NoteMark({ info, bad }: { info?: boolean; bad?: boolean }) {
  return <svg aria-hidden="true" className={bad ? 'ck-ic-sm hidden text-store-bad' : 'ck-ic-sm hidden'}><use href={info ? '#ck-i' : '#ck-a'} /></svg>
}
