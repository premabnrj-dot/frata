// =============================================================================
// FILE: src/lib/db/schema-communication.ts — Messages (WhatsApp) tables
// (docs/specs/2026-11-07-communication.md § Data; access: drizzle/0030_communication_access.sql).
// C1: the connection only. Health is typed facts read from Meta, never a status word we invent;
// what the merchant must do is derived by src/domains/communication/health.ts.
// =============================================================================

import { sql } from 'drizzle-orm'
import { boolean, check, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { at, id, tenants } from './schema'

/** A Meta id: digits only. Checked here and in the routing definers, so a crafted id never reaches a query. */
const metaId = (c: string) => sql.raw(`${c} ~ '^[0-9]{5,20}$'`)

/** A shop's WhatsApp number on the Cloud API. One open row per shop; a disconnect closes it and deletes the token. */
export const waConnections = pgTable('wa_connections', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  /** The Messaging account Frrata's app is subscribed to (the waba_id). Read from the token, never from the browser. */
  wabaId: text('waba_id').notNull(),
  phoneNumberId: text('phone_number_id').notNull(),
  businessId: text('business_id'),
  /** As Meta shows it, e.g. "+91 98450 12345". */
  displayPhone: text('display_phone').notNull(),
  verifiedName: text('verified_name'),
  /** Kept on the WhatsApp Business app too (coexistence): never registered with a PIN; echoes arrive. */
  coexistence: boolean('coexistence').notNull(),
  /** seal(token, tenantId, 'wa_token'). Null once disconnected: the token is deleted, the history stays. */
  tokenEnc: text('token_enc'),
  connectedAt: at('connected_at').notNull().defaultNow(),
  connectedBy: uuid('connected_by').notNull(),
  disconnectedAt: at('disconnected_at'),
  disconnectedBy: uuid('disconnected_by'),
  // Health, as Meta reports it (refreshed on connect, on a webhook, or by "Check again").
  quality: text('quality'),
  limitTier: text('limit_tier'),
  nameStatus: text('name_status'),
  /** False when the account has no payment method: Meta delivers nothing until one is added. Null: not known. */
  paymentOk: boolean('payment_ok'),
  currency: text('currency'),
  /** Meta can no longer be reached with the token (expired or removed): "Reconnect". */
  tokenRejectedAt: at('token_rejected_at'),
  historySyncAt: at('history_sync_at'),
  checkedAt: at('checked_at'),
}, (t) => [
  uniqueIndex('wa_connections_one_open').on(t.tenantId).where(sql`${t.disconnectedAt} is null`),
  // A number or an account is connected to one shop at a time (tenancy review: a forged id cannot claim it).
  uniqueIndex('wa_connections_number_open').on(t.phoneNumberId).where(sql`${t.disconnectedAt} is null`),
  uniqueIndex('wa_connections_waba_open').on(t.wabaId).where(sql`${t.disconnectedAt} is null`),
  index('wa_connections_tenant').on(t.tenantId),
  check('wa_connections_ids', sql`${metaId('waba_id')} and ${metaId('phone_number_id')} and (business_id is null or ${metaId('business_id')})`),
  check('wa_connections_closed', sql`(${t.disconnectedAt} is null) = (${t.disconnectedBy} is null) and (${t.disconnectedAt} is null) = (${t.tokenEnc} is not null)`),
])
