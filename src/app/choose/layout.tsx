// The app's stylesheet for every page under here (Signal S2-0: the root loads only the shop's sheet).
import '../globals.css'
import { Toaster } from '@/components/ui/toast'

export default function AppSheet({ children }: { children: React.ReactNode }) {
  return <Toaster>{children}</Toaster>
}
