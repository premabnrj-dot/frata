// India's states and union territories, as couriers and GST print them. Its own file so the checkout page can list
// them without loading the address checks (zod) into the browser.
import { STATES, type State } from './state-names'

export { STATES, type State }

/**
 * GST state codes (the first two digits of a GSTIN), for the place of supply on an invoice. A `Record` over
 * every state, so a state added above without its code does not compile. 26: the merged Dadra and Nagar Haveli
 * and Daman and Diu (25 retired); 38 Ladakh (CBIC state code list, as printed on the GST portal).
 */
export const STATE_CODE: Record<State, string> = {
  'Jammu and Kashmir': '01', 'Himachal Pradesh': '02', Punjab: '03', Chandigarh: '04', Uttarakhand: '05', Haryana: '06', Delhi: '07',
  Rajasthan: '08', 'Uttar Pradesh': '09', Bihar: '10', Sikkim: '11', 'Arunachal Pradesh': '12', Nagaland: '13', Manipur: '14',
  Mizoram: '15', Tripura: '16', Meghalaya: '17', Assam: '18', 'West Bengal': '19', Jharkhand: '20', Odisha: '21', Chhattisgarh: '22',
  'Madhya Pradesh': '23', Gujarat: '24', 'Dadra and Nagar Haveli and Daman and Diu': '26', Maharashtra: '27', Karnataka: '29', Goa: '30',
  Lakshadweep: '31', Kerala: '32', 'Tamil Nadu': '33', Puducherry: '34', 'Andaman and Nicobar Islands': '35', Telangana: '36',
  'Andhra Pradesh': '37', Ladakh: '38',
}

/** The code for a state as stored on an order (by name); null for anything not on the list. */
export const stateCode = (name: string | null | undefined): string | null => (name && name in STATE_CODE ? STATE_CODE[name as State] : null)
