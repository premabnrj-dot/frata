'use client'

import { useRef } from 'react'

/** Six boxes for a 6-digit code: moves on as you type, back on Backspace, takes a pasted code whole. */
export function CodeInput({ value, onChange, disabled, invalid }: {
  value: string
  onChange: (code: string) => void
  disabled?: boolean
  invalid?: boolean
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '')
  const set = (i: number, d: string) => {
    const next = digits.slice(); next[i] = d
    onChange(next.join('').slice(0, 6))
  }
  return (
    <div className="flex gap-2" role="group" aria-label="6-digit code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el }}
          id={i === 0 ? 'code' : undefined}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          aria-label={`Digit ${i + 1}`}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          value={d}
          className="h-13 w-11 rounded-md border border-input bg-card text-center font-mono text-xl transition-colors duration-fast aria-invalid:border-danger-text"
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(-1)
            set(i, v)
            if (v && i < 5) refs.current[i + 1]?.focus()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !d && i > 0) { refs.current[i - 1]?.focus(); set(i - 1, '') }
            if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
            if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus()
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
            if (!pasted) return
            e.preventDefault()
            onChange(pasted)
            refs.current[Math.min(pasted.length, 5)]?.focus()
          }}
        />
      ))}
    </div>
  )
}
