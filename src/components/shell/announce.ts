// =============================================================================
// FILE: src/components/shell/announce.ts — the shell's ONE polite live region.
//
// AppShell renders <div id="shell-announcer" aria-live="polite">. Anything
// that changes without moving focus — a confirm with Undo (1D·3's Toast), a
// save — calls announce("KS-1012 confirmed.") instead of adding a region of
// its own (plan U · A18). The text is cleared first so a repeat is read again.
// =============================================================================
export const ANNOUNCER_ID = 'shell-announcer'

/** A page without the shell (sign-in, the look editor, Admin's passkey gate) has its Toaster's region instead. */
const FALLBACK_ID = 'toast-announcer'

export function announce(text: string) {
  const el = typeof document === 'undefined' ? null : document.getElementById(ANNOUNCER_ID) ?? document.getElementById(FALLBACK_ID)
  if (!el) return
  el.textContent = ''
  window.setTimeout(() => { el.textContent = text }, 50)
}
