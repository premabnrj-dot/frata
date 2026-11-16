// ₹ from the API's paise, as Indian shoppers read it. The ONE place a price is formatted: nothing else in this site does
// arithmetic on a price (npm run check), so what a shopper reads is exactly what the store set.
export const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: paise % 100 ? 2 : 0 })}`
