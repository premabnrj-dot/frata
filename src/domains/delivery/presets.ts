// =============================================================================
// FILE: src/domains/delivery/presets.ts — Delivery Zones' starting zones (plan docs/plans/2026-11-12-delivery-zones.md).
// Matched by PIN-code PREFIX, never by district name: the India Post directory's districts do not follow city
// boundaries (Mumbai, Bangalore, Hyderabad/K.V.Rangareddy; frata-integrations § Shiprocket, 2026-11-12). A preset is a
// merchant default, not a courier fact: the brand edits a zone or adds its own. Server-only in practice (never in a
// browser chunk: check-client-bundle). Versioned: changing a list moves live shops, so a change is a new version.
//
// Sources: Metro = the 8 X-class cities and Tier 2 = the 89 Y-class cities of the HRA classification (DoE OM
// 2/5/2014-E.II(B) 21 Jul 2015, repeated 7 Jul 2017, + Mathura-Vrindavan from 1 Mar 2020; no later order as of
// 2026-11-12), each by its head post office's 3-digit sorting prefix. Special = the North East (78x–79x), Sikkim (737),
// Jammu & Kashmir and Ladakh (180–194), Andaman & Nicobar (744), Lakshadweep (682551–682559); couriers disagree on Kerala
// and Himachal Pradesh, so neither is in it.
// =============================================================================

export const PRESETS_VERSION = 1

export const PRESET_KEYS = ['metro', 'tier2', 'special', 'rest'] as const
export type PresetKey = (typeof PRESET_KEYS)[number]

export const PRESET_NAMES: Record<PresetKey, string> = { metro: 'Metro', tier2: 'Tier 2', special: 'Special', rest: 'Rest of India' }

/** Delhi, Mumbai, Bengaluru, Chennai, Kolkata, Hyderabad, Pune, Ahmedabad. */
const METRO = ['110', '400', '560', '600', '700', '500', '411', '380']

/** The Y-class cities' sorting prefixes (some cities share one; a prefix also covers its district's towns). */
const TIER2 = [
  '520', '506', '530', '522', '524', // Vijayawada, Warangal, Visakhapatnam, Guntur, Nellore
  '781', '800', '160', '490', '491', '492', // Guwahati, Patna, Chandigarh, Bhilai, Durg, Raipur
  '360', '361', '364', '390', '395', // Rajkot, Jamnagar, Bhavnagar, Vadodara, Surat
  '121', '122', '190', '180', // Faridabad, Gurgaon, Srinagar, Jammu
  '831', '826', '828', '834', '827', // Jamshedpur, Dhanbad, Ranchi, Bokaro
  '590', '580', '575', '570', '585', // Belgaum, Hubli-Dharwad, Mangalore, Mysore, Gulbarga
  '673', '682', '695', '680', '676', '670', '691', // Kozhikode, Kochi, Thiruvananthapuram, Thrissur, Malappuram, Kannur, Kollam
  '474', '452', '462', '482', '456', // Gwalior, Indore, Bhopal, Jabalpur, Ujjain
  '444', '440', '431', '422', '421', '413', '416', '401', '423', // Amravati, Nagpur, Aurangabad/Nanded, Nashik, Bhiwandi, Solapur, Kolhapur/Sangli, Vasai-Virar, Malegaon
  '753', '751', '769', '605', // Cuttack, Bhubaneswar, Rourkela, Puducherry
  '143', '144', '141', // Amritsar, Jalandhar, Ludhiana
  '334', '302', '342', '324', '305', // Bikaner, Jaipur, Jodhpur, Kota, Ajmer
  '636', '641', '620', '625', '638', // Salem, Coimbatore/Tiruppur, Tiruchirappalli, Madurai, Erode
  '244', '250', '201', '202', '282', '243', '226', '208', '211', '273', '221', '247', '283', '284', '281', // UP (Ghaziabad/Noida 201)
  '248', '713', '734', // Dehradun, Asansol/Durgapur, Siliguri
]

const SPECIAL_PREFIXES = [
  ...Array.from({ length: 20 }, (_, i) => String(780 + i)), // North East
  '737', // Sikkim
  ...Array.from({ length: 15 }, (_, i) => String(180 + i)), // Jammu & Kashmir, Ladakh (180–194)
  '744', // Andaman & Nicobar
]
const SPECIAL_PINS = new Set(Array.from({ length: 9 }, (_, i) => String(682551 + i))) // Lakshadweep

const sets: Record<Exclude<PresetKey, 'rest'>, Set<string>> = { metro: new Set(METRO), tier2: new Set(TIER2), special: new Set(SPECIAL_PREFIXES) }

/** Does this PIN code fall in a preset? `rest` takes everything (it is tried last). */
export function inPreset(key: PresetKey, pin: string): boolean {
  if (key === 'rest') return true
  // Lakshadweep shares Kochi's 682: its own PIN codes are Special, never Tier 2.
  if (SPECIAL_PINS.has(pin)) return key === 'special'
  return sets[key].has(pin.slice(0, 3))
}

/** The prefix lists, for tests and the console's "which PIN codes" line. */
export const PRESET_PREFIXES = { metro: METRO, tier2: TIER2, special: SPECIAL_PREFIXES } as const
