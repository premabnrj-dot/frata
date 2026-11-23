// A throwaway Studio store for the int tests (made as the superuser): a partner owner who is Frrata staff, with real staff
// and partner step-ups on one browser session, an active product, and the StudioOk requireStudio would answer for them.
import type { Sql } from 'postgres'

export type StudioFixture = {
  tenant: string; partner: string; member: string; user: string; browser: string; staffStepup: string; partnerStepup: string
  auth: { ok: true; userId: string; email: string; tenantId: string; tenantName: string; authSession: string; staffHash: string; partnerHash: string }
}

export async function makeStudioStore(su: Sql, stamp: string): Promise<StudioFixture> {
  const [u] = await su<[{ u: string; b: string }]>`select gen_random_uuid() as u, gen_random_uuid() as b`
  const email = `${stamp}@int.test`
  const [t] = await su<[{ id: string }]>`insert into tenants (slug, name) values (${'int-st-' + stamp}, 'Int Studio') returning id`
  const [p] = await su<[{ id: string }]>`insert into partners (user_id, email, name, phone, city, brands_now, terms_version, agreed_at, approved_at)
    values (${u.u}, ${email}, 'Int P', '919800000102', 'Jaipur', '0', 1, now(), now()) returning id`
  const [pm] = await su<[{ id: string }]>`insert into partner_members (partner_id, user_id, email, role, accepted_at) values (${p.id}, ${u.u}, ${email}, 'owner', now()) returning id`
  await su`insert into partner_links (tenant_id, partner_id, share_bps, share_months, notice_days) values (${t.id}, ${p.id}, 2000, 24, 90)`
  await su`insert into members (tenant_id, user_id, role, partner_member_id) values (${t.id}, ${u.u}, 'partner', ${pm.id})`
  await su`insert into shop_settings (tenant_id) values (${t.id}) on conflict do nothing`
  await su`insert into platform_staff (user_id, email, role) values (${u.u}, ${email}, 'support')`
  const [sk] = await su<[{ id: string }]>`insert into staff_passkeys (user_id, credential_id, public_key, name) values (${u.u}, ${'int-' + stamp}, 'k', 'Int') returning id`
  const [ss] = await su<[{ id: string }]>`insert into staff_stepups (user_id, session_id, passkey_id, token_hash, expires_at) values (${u.u}, ${u.b}, ${sk.id}, ${'sh-' + stamp}, now() + interval '1 hour') returning id`
  const [pk] = await su<[{ id: string }]>`insert into partner_passkeys (partner_member_id, user_id, credential_id, public_key, name) values (${pm.id}, ${u.u}, ${'intp-' + stamp}, 'k', 'Int') returning id`
  const [ps] = await su<[{ id: string }]>`insert into partner_stepups (partner_member_id, user_id, session_id, passkey_id, token_hash, expires_at) values (${pm.id}, ${u.u}, ${u.b}, ${pk.id}, ${'ph-' + stamp}, now() + interval '1 hour') returning id`
  const [prod] = await su<[{ id: string }]>`insert into products (tenant_id, handle, title, options, status, hsn) values (${t.id}, ${'kurta-' + stamp}, 'Indigo kurta', '{Size}', 'active', '6109') returning id`
  await su`insert into variants (tenant_id, product_id, option_values, price, stock) values (${t.id}, ${prod.id}, '{M}', 149900, 7)`
  return {
    tenant: t.id, partner: p.id, member: pm.id, user: u.u, browser: u.b, staffStepup: ss.id, partnerStepup: ps.id,
    auth: { ok: true, userId: u.u, email, tenantId: t.id, tenantName: 'Int Studio', authSession: u.b, staffHash: 'sh-' + stamp, partnerHash: 'ph-' + stamp },
  }
}
