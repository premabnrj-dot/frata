// THE CHROME EVERY TABLE SHARES — frame, header band, row rule, hover (from Ekatan).
// It shares the chrome, NOT the columns: each table writes its own cells.

export function DataTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-card">
      <table className="w-full text-sm">{children}</table>
    </div>
  )
}

export function DataTableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="border-b border-border bg-muted/50 text-left">
      <tr className="text-xs font-medium text-muted-foreground [&>th]:px-3 [&>th]:py-2">{children}</tr>
    </thead>
  )
}

export function DataTableRow({ children, dimmed = false }: { children: React.ReactNode; dimmed?: boolean }) {
  return (
    <tr className={`border-b border-border last:border-0 hover:bg-muted/40 [&>td]:px-3 [&>td]:py-2 ${dimmed ? 'opacity-60' : ''}`}>
      {children}
    </tr>
  )
}
