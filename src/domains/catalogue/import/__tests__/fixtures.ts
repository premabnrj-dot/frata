// The fixture files as the browser reads a CSV: papaparse, then sheetOf.
import { readFileSync } from 'node:fs'
import Papa from 'papaparse'
import { sheetOf, type Sheet } from '../sheet'

export const fixture = (name: string) => new URL(`./fixtures/${name}`, import.meta.url)

export function csvSheet(name: string): Sheet {
  const grid = Papa.parse<string[]>(readFileSync(fixture(name), 'utf8'), { skipEmptyLines: 'greedy' }).data
  const s = sheetOf(grid)
  if (!s.ok) throw new Error(s.error)
  return s.sheet
}
