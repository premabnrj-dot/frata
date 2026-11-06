import type { ReactNode } from 'react'

/**
 * One frame for every state that is not data: empty, no access, setup needed,
 * error. A title that says what is true, one sentence of why, and one way on.
 */
export function Panel({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mx-auto max-w-md rounded-md border border-border bg-card p-6 text-center">
      <h2 className="text-lg font-medium">{title}</h2>
      {children && <div className="mt-2 text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
