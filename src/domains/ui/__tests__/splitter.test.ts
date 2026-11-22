import { describe, expect, it } from 'vitest'
import { clampTo, splitterDrag, splitterKey } from '../splitter'

const left = { value: 300, min: 200, max: 400, grows: 'ArrowRight' as const }
const right = { ...left, grows: 'ArrowLeft' as const }

describe('a resize edge (window splitter)', () => {
  it('moves by 16, or 64 with Shift, toward the arrow that widens it', () => {
    expect(splitterKey(left, 'ArrowRight')).toBe(316)
    expect(splitterKey(left, 'ArrowLeft', true)).toBe(236)
    expect(splitterKey(right, 'ArrowLeft')).toBe(316)
    expect(splitterKey(right, 'ArrowRight')).toBe(284)
  })
  it('stops at its limits; Home and End go to them; other keys are not its own', () => {
    expect(splitterKey({ ...left, value: 395 }, 'ArrowRight')).toBe(400)
    expect(splitterKey(left, 'Home')).toBe(200)
    expect(splitterKey(left, 'End')).toBe(400)
    expect(splitterKey(left, 'ArrowUp')).toBeNull()
  })
  it('follows a drag, inverted for a panel on the right', () => {
    expect(splitterDrag(left, 50)).toBe(350)
    expect(splitterDrag(right, 50)).toBe(250)
    expect(splitterDrag(left, 900)).toBe(400)
  })
  it('clamps a value that is not a number to its fallback', () => {
    expect(clampTo(0, 10, Number.NaN, 5)).toBe(5)
  })
})
