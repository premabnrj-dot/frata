import { describe, expect, it } from 'vitest'
import { latinOf } from '../indic'
import { handleFor } from '../variants'

describe('Indian scripts in a product address', () => {
  it('writes each of the nine scripts in Latin letters, never dropping them', () => {
    for (const [title, handle] of [
      ['लिनन कुर्ता', 'linan-kurta'], ['बनारसी साड़ी', 'banarasi-sari'], ['हिंदी रंग', 'hindi-rang'], ['चिकनकारी कुर्ती', 'chikanakari-kurti'],
      ['ज़री फ़्रॉक', 'zari-frok'], // nukta: z, f
      ['জামদানি শাড়ি', 'jamadani-shari'], // Bengali
      ['ਫੁਲਕਾਰੀ ਦੁਪੱਟਾ', 'phulakari-dupata'], // Gurmukhi
      ['પટોળા સાડી', 'patola-sadi'], // Gujarati
      ['ସମ୍ବଲପୁରୀ ଶାଢ଼ୀ', 'sambalapuri-sharhi'], // Odia
      ['பட்டு புடவை', 'pattu-putavai'], // Tamil
      ['కంచి పట్టు చీర', 'kanchi-pattu-chira'], // Telugu
      ['ಇಳಕಲ್ ಸೀರೆ', 'ilakal-sire'], // Kannada
      ['കസവ് സാരി', 'kasav-sari'], ['കൾ', 'kal'], // Malayalam, a chillu
      ['Kurta कुर्ता & Co.', 'kurta-kurta-and-co'], ['साड़ी।', 'sari'],
    ] as const) expect(handleFor(title), title).toBe(handle)
  })
  it('the same letters typed precomposed or decomposed read the same', () => {
    expect(latinOf('ज़री')).toBe(latinOf('ज़री')) // ज़री, one code point or two
  })
  it('leaves other text alone; a name with no letters still has no address', () => {
    expect(latinOf('Linen kurta, ₹1,299')).toBe('Linen kurta, ₹1,299')
    expect(handleFor('🌸')).toBe('')
    expect(handleFor('Crème brûlée')).toBe('creme-brulee')
  })
})
