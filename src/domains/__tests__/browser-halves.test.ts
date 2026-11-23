import { describe, expect, it } from 'vitest'
import * as kinds from '../content/kinds'
import * as kindsFacts from '../content/kinds-facts'
import * as templates from '../pages/templates'
import * as templatesFacts from '../pages/templates-facts'
import * as sections from '../themes/sections'
import * as sectionsFacts from '../themes/sections-facts'
import * as site from '../themes/site'
import * as siteFacts from '../themes/site-facts'
import * as layer from '../themes/layer'
import * as layerFacts from '../themes/layer-facts'
import * as stories from '../catalogue/stories'
import * as storiesFacts from '../catalogue/stories-facts'
import * as productForm from '../catalogue/product-form'
import * as readiness from '../catalogue/readiness'
import * as documents from '../orders/documents'
import * as printCap from '../orders/print-cap'
import * as discounts from '../checkout/discounts'
import * as discountStyles from '../checkout/discount-styles'
import * as offerText from '../checkout/offer-text'
import * as saysOnline from '../checkout/says-online'

// Page weight (2026-11-23, docs/plans/2026-11-23-page-weight.md): a browser imports a domain file's zod-free half, the
// server its original, which re-exports the half. They must be ONE value, never a copy that drifts: each name a half
// exports is the very same object in the original. (check:layers keeps each half zod-free.)
const pairs: [string, Record<string, unknown>, Record<string, unknown>][] = [
  ['content/kinds', kinds, kindsFacts], ['pages/templates', templates, templatesFacts], ['themes/sections', sections, sectionsFacts],
  ['themes/site', site, siteFacts], ['themes/layer', layer, layerFacts], ['catalogue/stories', stories, storiesFacts],
  ['catalogue/product-form', productForm, readiness], ['orders/documents', documents, printCap],
  ['checkout/discounts', discounts, discountStyles], ['checkout/offer-text', offerText, saysOnline],
]

describe('a browser half and its original are one value', () => {
  for (const [name, original, half] of pairs) {
    it(`${name} re-exports its half, never a copy`, () => {
      const names = Object.keys(half)
      expect(names.length).toBeGreaterThan(0)
      for (const k of names) expect(original[k], `${name}.${k}`).toBe(half[k])
    })
  }
})
