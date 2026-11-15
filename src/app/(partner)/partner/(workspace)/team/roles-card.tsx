import { Section } from '@/components/layout/section'
import { Icon } from '@/components/icons/icon'

// What each partner role reaches in a store (approved T1c mockup, screen 1: the Roles card). Words, never colour alone:
// each mark carries its meaning for a screen reader. The definers and CAPABILITIES are the lock; this only says it.
type Cell = boolean | string
const ROWS: readonly (readonly [string, Cell, Cell, Cell])[] = [
  ['Orders and shoppers', true, true, false],
  ['Costs and profit', 'Until handover', 'Until handover', false],
  ['Products', 'Edit', 'Edit', 'View'],
  ['Look and settings', true, true, false],
  ['Hand over', true, false, false],
  ['Team', true, false, false],
]

function Mark({ v }: { v: Cell }) {
  if (typeof v === 'string') return <span className="text-small text-muted-foreground">{v}</span>
  return v ? <><Icon name="tick" className="mx-auto size-4 text-ok-text" /><span className="sr-only">Yes</span></>
    : <><Icon name="dash" className="mx-auto size-4 text-muted-foreground" /><span className="sr-only">No</span></>
}

export function RolesCard() {
  return (
    <Section title="Roles">
      <table className="w-full border-collapse text-sm">
        <thead><tr className="text-small text-muted-foreground"><th scope="col" className="py-1.5 text-left font-medium"><span className="sr-only">In a store</span></th><th scope="col" className="py-1.5 font-medium">Partner owner</th><th scope="col" className="py-1.5 font-medium">Lead</th><th scope="col" className="py-1.5 font-medium">Builder</th></tr></thead>
        <tbody>
          {ROWS.map(([what, ...cells]) => (
            <tr key={what} className="border-t border-border">
              <th scope="row" className="py-2 text-left font-normal">{what}</th>
              {cells.map((c, i) => <td key={i} className="py-2 text-center"><Mark v={c} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  )
}
