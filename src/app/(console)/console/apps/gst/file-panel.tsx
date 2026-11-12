'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { dateTimeIN } from '@/lib/format-date'
import type { FilingStep, Liability } from '@/domains/tax/gsp'
import { gstConnect, gstDisconnect, gstFile, gstFileOtp, gstPush, gstVerify } from './actions'
import { FIELD } from '@/components/ui/field'

// =============================================================================
// Filing from Frrata (GST app G2; approved mockup "File from Frrata"): connect with the portal's OTP, push, see the
// portal's totals beside ours, file with the EVC OTP. Shown only when the switch is on (src/lib/gst/gsp.ts). Filing
// is final, so it asks for a tick that says so (the one sentence Rule 0 allows: an irreversible consequence).
// =============================================================================

const rs = (p: number) => `₹${(p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const HEADS: [keyof Liability, string][] = [['taxable', 'Taxable value'], ['cgst', 'CGST'], ['sgst', 'SGST'], ['igst', 'IGST'], ['documents', 'Documents']]
const input = FIELD

export function FilePanel({ period, step, ours, portal, username, pushedAt, filedAt, arn, gspName }: {
  period: string; step: FilingStep; ours: Liability; portal: Liability | null; username: string | null
  pushedAt: string | null; filedAt: string | null; arn: string | null; gspName: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const toast = useToast()
  // The refusal on screen (an error toast stays until closed): the next step that works takes it away.
  const shown = useRef<number | null>(null)
  const [txn, setTxn] = useState<string | null>(null)
  const [user, setUser] = useState(username ?? '')
  const [otp, setOtp] = useState('')
  const [fileOtp, setFileOtp] = useState(false)
  const [sure, setSure] = useState(false)
  const run = (f: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => start(async () => {
    const r = await f()
    if (!r.ok) {
      shown.current = toast.next()
      if (r.error) toast.error(r.error); else toast.error('Something went wrong.', { sub: 'Nothing was filed.' })
      return
    }
    if (shown.current !== null) { toast.dismiss(shown.current); shown.current = null }
    setOtp(''); after?.(); router.refresh()
  })
  const otpBox = (label: string) => (
    <input aria-label={label} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit OTP" className={`${input} w-36 font-mono tracking-widest`} />
  )

  if (step === 'filed') return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-4">
      <span aria-hidden="true" className="grid size-7 place-items-center rounded-full bg-ok text-xs font-semibold text-ok-text">✓</span>
      <span className="flex-1 text-sm"><b className="block">GSTR-1 filed</b>{filedAt ? dateTimeIN(new Date(filedAt)) : ''} · ARN <span className="font-mono">{arn}</span></span>
    </div>
  )

  return (
    <div className="space-y-4">
      {step === 'connect' ? (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(txn ? () => gstVerify(txn, otp) : async () => { const r = await gstConnect(user); if (r.ok) setTxn(r.txn); return r }) }}>
          <label className="space-y-1 text-sm font-medium"><span className="block">GST portal username</span>
            <input value={user} onChange={(e) => setUser(e.target.value)} disabled={!!txn} autoComplete="username" maxLength={60} className={`${input} w-56`} /></label>
          {txn && otpBox('OTP from the GST portal')}
          <button type="submit" disabled={pending || !user || (!!txn && otp.length !== 6)} className={button({})}>{txn ? 'Connect' : 'Send OTP'}</button>
          {txn && <button type="button" onClick={() => { setTxn(null); setOtp('') }} className={button({ variant: 'ghost' })}>Change</button>}
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="flex-1">Connected as <b>{username}</b> through {gspName}{pushedAt ? ` · pushed ${dateTimeIN(new Date(pushedAt))}` : ''}</span>
          <button type="button" disabled={pending} onClick={() => run(() => gstPush(period))} className={button({ variant: step === 'push' ? 'primary' : 'secondary' })}>{pushedAt ? 'Push again' : 'Push to the portal'}</button>
          <button type="button" disabled={pending} onClick={() => run(() => gstDisconnect())} className={button({ variant: 'ghost' })}>Disconnect</button>
        </div>
      )}

      {portal && (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 font-medium">This period</th><th className="py-1 text-right font-medium">Frrata</th><th className="py-1 text-right font-medium">GST portal</th></tr></thead>
          <tbody className="divide-y divide-border">
            {HEADS.map(([h, l]) => {
              const off = h === 'documents' ? ours[h] !== portal[h] : Math.abs(ours[h] - portal[h]) > 100
              const f = (v: number) => (h === 'documents' ? String(v) : rs(v))
              return <tr key={h} className={off ? 'text-danger-text' : undefined}><td className="py-2">{l}</td><td className="py-2 text-right font-mono tabular-nums">{f(ours[h])}</td><td className="py-2 text-right font-mono tabular-nums">{f(portal[h])}{off ? ' ≠' : ' ✓'}</td></tr>
            })}
          </tbody>
        </table>
      )}

      {step === 'file' && (
        <form className="space-y-3 rounded-lg border border-border p-4" onSubmit={(e) => { e.preventDefault(); run(fileOtp ? () => gstFile(period, otp) : async () => { const r = await gstFileOtp(period); if (r.ok) setFileOtp(true); return r }) }}>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} className="mt-0.5 size-4" />
            <span>I’ve checked this return. A filed GSTR-1 can’t be changed; a mistake is corrected in a later period.</span></label>
          <div className="flex flex-wrap items-center gap-2">
            {fileOtp && otpBox('EVC OTP')}
            <button type="submit" disabled={pending || !sure || (fileOtp && otp.length !== 6)} className={button({})}>{fileOtp ? 'File GSTR-1' : 'Send EVC OTP'}</button>
          </div>
        </form>
      )}
      {/* feedback-ok: a state of the return with what to do next (rule 5), not the result of a button */}
      {step === 'check' && <p className="text-sm text-danger-text">The portal’s totals don’t match ours. Push again; if they still differ, send the files to your CA.</p>}
    </div>
  )
}
