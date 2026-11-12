// =============================================================================
// FILE: src/domains/catalogue/chart-units.ts
//
// A SIZE CHART AS THE SHOP SHOWS IT: its shape and cm → inches. Apart from size-charts.ts (the starting charts, the
// checks), so the shop's product page carries these few lines and not every starting chart (products PR·2: the
// page's script went over its 121 kB budget when the console's new-product step shared that module).
// =============================================================================

export type Chart = { columns: string[]; rows: { size: string; values: (number | null)[] }[]; howToMeasure: string }

/** 86 cm → "33.9"; for showing a chart in inches. */
export const inches = (cm: number) => (Math.round((cm / 2.54) * 10) / 10).toFixed(1)
