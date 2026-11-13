// One line for where an order goes and how much it holds: "Jaipur · 2 items" (the queue's rows and Home's, one copy).
export function placeLine(city: string | null, items: number): string {
  return [city, `${items} item${items === 1 ? '' : 's'}`].filter(Boolean).join(' · ')
}
