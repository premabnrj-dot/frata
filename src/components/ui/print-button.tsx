'use client'

import { Button } from './button'

/** Opens the browser's print dialog (documents are print pages, not PDFs: design-language § Work queues 9). */
export function PrintButton() {
  return <Button onClick={() => window.print()} className="print:hidden">Print</Button>
}
