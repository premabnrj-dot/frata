import { Toaster } from '@/components/ui/toast'

// The application page's ONE Toaster (feedback F3): around the sign-in step (signed out) and the form (signed in). The
// public /partners page above it has none (rule 44: no client island on a marketing page).
export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return <Toaster>{children}</Toaster>
}
