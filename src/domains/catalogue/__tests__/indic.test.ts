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
  it('reads a two-part vowel sign (o, ai, au) as one vowel in every script that has one', () => {
    for (const [title, handle] of [
      ['সোনা', 'sona'], ['সৌরভ', 'saurabh'], // Bengali o, au
      ['କୋଣାର୍କ', 'konarka'], ['ପୈଠଣୀ', 'paithani'], ['ମୌସୁମୀ', 'mausumi'], // Odia o, ai, au
      ['கொலுசு', 'koluchu'], ['கோவை', 'kovai'], ['பௌர்ணமி', 'paurnami'], // Tamil o, oo, au
      ['కైలాస', 'kailasa'], ['కొండపల్లి', 'kondapalli'], // Telugu ai, o
      ['ಕೊಡಗು', 'kodagu'], ['ಕೈಮಗ್ಗ', 'kaimagga'], ['ಕೌದಿ', 'kaudi'], // Kannada o, ai, au
      ['കൊച്ചി', 'kochchi'], ['കൈത്തറി', 'kaittari'], ['കൌശല', 'kaushala'], // Malayalam o, ai, au
    ] as const) expect(handleFor(title), title).toBe(handle)
  })
  it('the same letters typed composed or in parts read the same', () => {
    expect(latinOf('\u095b\u0930\u0940')).toBe(latinOf('\u091c\u093c\u0930\u0940')) // ज़री, one code point or two
    expect(latinOf('\u09b8\u09cb\u09a8\u09be')).toBe(latinOf('\u09b8\u09c7\u09be\u09a8\u09be')) // সোনা, ো or ে + া
    expect(latinOf('\u0b95\u0bca')).toBe('ko') // கொ typed as one sign
    expect(latinOf('\u0b95\u0bc6\u0bbe')).toBe('ko') // … or as its two parts
  })
  it('leaves other text alone; a name with no letters still has no address', () => {
    expect(latinOf('Linen kurta, \u20b91,299')).toBe('Linen kurta, \u20b91,299')
    expect(handleFor('🌸')).toBe('')
    expect(handleFor('Crème brûlée')).toBe('creme-brulee')
  })
})
