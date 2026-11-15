import { SHELL_FONT_VARS } from '@/components/shell/fonts'
import { Selvedge, SiteStage } from '@/components/brand/site'
import { Wordmark } from '@/components/brand/wordmark'

// =============================================================================
// FILE: src/components/passkeys/partner-frame.tsx — the brand surface every partner sign-in screen sits on (partner
// sign-in mockup https://claude.ai/artifact/Cway5SSahPgQeuCo2UmdTJ): the ink stage with the mark and a PARTNER tag, the
// woven edge, then one card. Sign in, the email link, join, the passkey check and signed out all use it.
// =============================================================================

export function PartnerFrame({ children }: { children: React.ReactNode }) {
  return (
    <div data-shell className={`flex min-h-dvh flex-col bg-background ${SHELL_FONT_VARS}`}>
      <SiteStage>
        <header className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-8">
          <Wordmark thread onInk className="h-6" />
          <span className="flex-1" />
          <span className="rounded-full border border-ink-foreground/35 px-2 py-0.5 text-[0.6875rem] font-semibold tracking-[0.08em]">PARTNER</span>
        </header>
      </SiteStage>
      <Selvedge />
      <main id="content" tabIndex={-1} className="flex flex-1 items-start justify-center p-4 pt-12 outline-none">
        <div className="grid w-full max-w-sm gap-4 rounded-md border border-border bg-card p-6">{children}</div>
      </main>
    </div>
  )
}

/** "1 Join — 2 Approval — 3 Passkey" (mockup screens 6–8): the first-time path, the current step marked. */
export function JoinSteps({ at }: { at: 1 | 2 | 3 }) {
  const steps = ['Join', 'Approval', 'Passkey'] as const
  return (
    <ol aria-label="Steps" className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      {steps.map((s, i) => {
        const n = (i + 1) as 1 | 2 | 3
        const done = n < at
        return (
          <li key={s} aria-current={n === at ? 'step' : undefined} className={`flex items-center gap-1.5 ${n === at ? 'font-medium text-foreground' : ''}`}>
            {i > 0 && <span aria-hidden="true" className="h-px w-3.5 bg-input" />}
            <span aria-hidden="true" className={`grid size-[18px] place-items-center rounded-full border-[1.5px] text-[0.65rem] font-semibold ${done ? 'border-ok-mark bg-ok-mark text-background' : n === at ? 'border-foreground' : 'border-input'}`}>{n}</span>
            {s}{done && <span className="sr-only"> (done)</span>}
          </li>
        )
      })}
    </ol>
  )
}

/** The fingerprint tile above "Sign in faster next time" (mockup screens 8, 14). */
export function PasskeyTile() {
  return (
    <span aria-hidden="true" className="grid size-[52px] place-items-center rounded-[14px] bg-warn">
      <FingerprintIcon className="size-7" />
    </span>
  )
}

export function FingerprintIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} fill-none stroke-current`} strokeWidth={1.6} strokeLinecap="round">
      <path d="M12 11v3a6 6 0 0 1-1.5 4M8.5 9.5A4 4 0 0 1 16 11v2M6 8a7 7 0 0 1 12 3M9 14c0 2-1 4-2.5 5M15 15.5c-.2 1.6-.8 3-1.6 4" />
    </svg>
  )
}

/** The big 6-digit code someone reads aloud (mockup screens 7, 11, 21). */
export function ReadCode({ code }: { code: string }) {
  return (
    <p aria-label={`Code ${code.split('').join(' ')}`} className="rounded-xl border border-dashed border-input bg-card py-3.5 text-center font-mono text-[2.125rem] font-semibold tracking-[0.14em] tabular-nums">
      {code.slice(0, 3)} {code.slice(3)}
    </p>
  )
}
