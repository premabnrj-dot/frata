// The app's stylesheet for every page under here (Signal S2-0: the root loads only the shop's sheet).
import '../globals.css'
import { Toaster } from '@/components/ui/toast'

// The look editor's ONE Toaster (frata-design-language § Feedback 8): no AppShell here, so it renders its own polite
// region. A removal's Undo, a refused save and a failed publish are its toasts.
export default function AppSheet({ children }: { children: React.ReactNode }) {
  return <div data-neel="" className="contents"><Toaster>{children}</Toaster></div>
}
