import './globals.css' // the app sheet (Signal S2-0)
import { Panel } from '@/components/ui/panel'

export default function NotFound() {
  return (
    <main className="p-6">
      <Panel title="This page does not exist" />
    </main>
  )
}
