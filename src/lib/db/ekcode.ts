import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from './index'

// =============================================================================
// FILE: src/lib/db/ekcode.ts — EVERY CALL INTO THE EKCODE VAULT (drizzle/0087), and nothing else. Each is one SECURITY
// DEFINER function that re-checks its own proof; this file only shapes arguments and answers. The app never reads an
// ekcode_* table (it holds no grant). Callers: src/lib/ekcode/** and the EkCode routes. Never log an argument here.
// =============================================================================

const one = async <T>(q: ReturnType<typeof sql>): Promise<T | null> => ((await db().execute(q)) as unknown as T[])[0] ?? null
const arr = (xs: string[]) => sql`${`{${xs.map((x) => `"${x}"`).join(',')}}`}::text[]`

export const startFlow = async (tenantId: string, host: string, handleDigest: string, state: string, challenge: string, arm: 'shown' | 'held') =>
  (await one<{ ok: boolean }>(sql`select app_ekcode_start_flow(${tenantId}::uuid, ${host}, ${handleDigest}, ${state}, ${challenge}, ${arm}) as ok`))?.ok === true

export const flowView = (handleDigest: string) =>
  one<{ shop_name: string; host: string }>(sql`select shop_name, host from app_ekcode_flow_view(${handleDigest})`)

export type IssueVerdict = { verdict: 'ok' | 'pow' | 'wait' | 'blocked' | 'capped' | 'off' | 'expired'; until: Date | null; pow_bits: number }

export const issueCode = async (handleDigest: string, phoneKeys: string[], codeId: string, codeHmac: string, netNarrow: string, netWide: string, powSolved: number) =>
  (await one<IssueVerdict>(sql`select verdict, until, pow_bits from app_ekcode_issue_code(${handleDigest}, ${arr(phoneKeys)}, ${codeId}::uuid, ${codeHmac}, ${netNarrow}, ${netWide}, ${powSolved}::smallint)`))
  ?? { verdict: 'expired', until: null, pow_bits: 0 }

export const markSent = (codeId: string, wamid: string | null) => db().execute(sql`select app_ekcode_mark_sent(${codeId}::uuid, ${wamid})`)
export const markFailed = (codeId: string, error: number | null) => db().execute(sql`select app_ekcode_mark_failed(${codeId}::uuid, ${error}::int)`)

export const codeStatus = (handleDigest: string, codeId: string) =>
  one<{ sent: boolean; delivered: boolean; failed: boolean; expired: boolean }>(sql`select * from app_ekcode_code_status(${handleDigest}, ${codeId}::uuid)`)

export type AccountView = { seal_ref: string; name_sealed: string; phone_sealed: string; addresses: { id: string; label: string }[] }
export type VerifyResult = { ok: boolean; tries_left: number; has_account: boolean } & Partial<AccountView>

export const verifyCode = async (handleDigest: string, codeId: string, codeHmacs: string[], proofDigest: string): Promise<VerifyResult> =>
  (await one<VerifyResult>(sql`select * from app_ekcode_verify(${handleDigest}, ${codeId}::uuid, ${arr(codeHmacs)}, ${proofDigest})`))
  ?? { ok: false, tries_left: 0, has_account: false }

export const createAccount = async (handleDigest: string, proofDigest: string, sealRef: string, phoneSealed: string, nameSealed: string, notice: string) =>
  (await one<{ ok: boolean }>(sql`select app_ekcode_create_account(${handleDigest}, ${proofDigest}, ${sealRef}::uuid, ${phoneSealed}, ${nameSealed}, ${notice}) as ok`))?.ok === true

export const grant = (handleDigest: string, proofDigest: string, addressId: string | null, codeDigest: string) =>
  one<{ host: string; state: string }>(sql`select host, state from app_ekcode_grant(${handleDigest}, ${proofDigest}, ${addressId}::uuid, ${codeDigest})`)

export type Redeemed = { pairwise: string; seal_ref: string; name_sealed: string; phone_sealed: string; address_id: string | null; address_label: string | null; address_sealed: string | null; items: string[] }

/** Runs inside the shop's own transaction when one is passed (one round trip for the whole return: speed M3). */
export const redeem = async (codeDigest: string, challenge: string, tenantId: string, host: string, saveDigest: string | null, tx?: { execute: (q: ReturnType<typeof sql>) => Promise<unknown> }) => {
  const q = sql`select * from app_ekcode_redeem(${codeDigest}, ${challenge}, ${tenantId}::uuid, ${host}, ${saveDigest})`
  const rows = (await (tx ?? db()).execute(q)) as unknown as Redeemed[]
  return rows[0] ?? null
}

/** Runs inside the shop's transaction when one is passed, so the spent save token and the address commit together. */
export const saveAddress = async (saveDigest: string, tenantId: string, addressId: string, label: string, sealed: string, tx?: { execute: (q: ReturnType<typeof sql>) => Promise<unknown> }) => {
  const rows = (await (tx ?? db()).execute(sql`select app_ekcode_save_address(${saveDigest}, ${tenantId}::uuid, ${addressId}::uuid, ${label}, ${sealed}) as ok`)) as unknown as { ok: boolean }[]
  return rows[0]?.ok === true
}

export const storeEvent = async (eventKey: string, wamid: string, status: string, error: number | null, at: Date) =>
  (await one<{ ok: boolean }>(sql`select app_ekcode_store_event(${eventKey}, ${wamid}, ${status}, ${error}::int, ${at.toISOString()}::timestamptz) as ok`))?.ok === true
export const applyEvents = async (limit = 500) => (await one<{ n: number }>(sql`select app_ekcode_apply_events(${limit}::int) as n`))?.n ?? 0

export const recordExposure = (tenantId: string, arm: 'shown' | 'held', visitorDigest: string) =>
  db().execute(sql`select app_ekcode_exposure(${tenantId}::uuid, ${arm}, ${visitorDigest})`)
export const dailyEkcode = () => db().execute(sql`select app_ekcode_daily()`)
