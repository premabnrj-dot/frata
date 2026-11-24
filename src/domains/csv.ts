// A CSV cell, shared by every export (billing's GST file, Admin › Costs'): quoted, quotes doubled, and a leading = + - @ (or tab/CR)
// neutralised so a spreadsheet never runs it (billing finding 17). Pure.
export function csvCell(v: string | number): string {
  const s = String(v)
  // A plain number ("-118.00") stays a number; anything else starting with a formula character is made text.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s
  return `"${safe.replace(/"/g, '""')}"`
}
