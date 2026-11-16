import { redirect } from 'next/navigation'
import { Panel } from '@/components/ui/panel'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'

/** Modules became Apps across Frrata (owner, 2026-11-15); an old link still lands. */
export default async function OldModules() {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  redirect('/admin/apps')
}
