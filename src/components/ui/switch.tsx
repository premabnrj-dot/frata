'use client'

// =============================================================================
// FILE: src/components/ui/switch.tsx — THE switch (motion system, owner-approved 2026-11-08: "one Switch").
// Settings, Apps and the look customizer each drew their own, at three speeds and two "on" colours. One now:
// the knob on the snap curve in 120 ms. Neel § Components: a 34×20 track, off in --off (g500), on in the action colour,
// a 16 px white knob with e1; the target reaches 44 px around it on a phone, 36 from md.
// =============================================================================

export function Switch({ on, onChange, label, id, disabled }: { on: boolean; onChange: (v: boolean) => void; label?: string; id?: string; disabled?: boolean }) {
  return (
    <button id={id} type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative inline-flex h-5 w-[34px] shrink-0 items-center rounded-full transition-colors duration-fast ease-standard before:absolute before:-inset-x-2 before:-inset-y-3 md:before:-inset-y-2 before:content-[''] disabled:opacity-45 ${on ? 'bg-primary' : 'bg-off'}`}>
      <span aria-hidden="true" className={`absolute left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform duration-fast ease-snap ${on ? 'translate-x-3.5' : ''}`} />
    </button>
  )
}
