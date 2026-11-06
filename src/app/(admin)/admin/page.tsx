import { redirect } from 'next/navigation'
import { Panel } from '@/components/ui/panel'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'

export default async function AdminHome() {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  redirect('/admin/merchants')
}
