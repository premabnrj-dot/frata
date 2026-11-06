'use server'

import { z } from 'zod'
import { sendSignInLink } from '@/lib/auth/send-link'

// ENTRY POINT credential: none needed — it only asks Supabase to email a link
// to the address given; access is decided by requireMember/requireStaff after sign-in.
const Email = z.object({ email: z.email() })

export async function sendMagicLink(_: unknown, form: FormData): Promise<{ sent: boolean; error?: string }> {
  const parsed = Email.safeParse({ email: form.get('email') })
  if (!parsed.success) return { sent: false, error: 'Enter a valid email address' }
  const r = await sendSignInLink(parsed.data.email)
  return r.sent ? { sent: true } : { sent: false, error: r.error }
}
