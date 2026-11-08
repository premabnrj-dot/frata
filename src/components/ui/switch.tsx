'use client'

// =============================================================================
// FILE: src/components/ui/switch.tsx — THE switch (motion system, owner-approved 2026-11-08: "one Switch").
// Settings, Apps and the look customizer each drew their own, at three speeds and two "on" colours. One now:
// ink when on, the knob on the snap curve in 120 ms; a 40 px target around the 24 px track.
// =============================================================================

export function Switch({ on, onChange, label, id, disabled }: { on: boolean; onChange: (v: boolean) => void; label?: string; id?: string; disabled?: boolean }) {
  return (
    <button id={id} type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-fast ease-standard before:absolute before:-inset-2 before:content-[''] disabled:opacity-50 ${on ? 'border-primary bg-primary' : 'border-input bg-card'}`}>
      <span aria-hidden="true" className={`absolute left-0.5 size-[18px] rounded-full transition-transform duration-fast ease-snap ${on ? 'translate-x-5 bg-primary-foreground' : 'bg-input'}`} />
    </button>
  )
}
