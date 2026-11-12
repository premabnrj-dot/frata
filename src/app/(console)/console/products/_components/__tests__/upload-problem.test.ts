// One photo's upload problem in words (the editor and the Photos page say the same): storage's own messages are for
// us, never shown as they are, except the short code after "send us this".
import { describe, expect, it } from 'vitest'
import { photoUploadProblem } from '../upload-problem'

describe('photoUploadProblem', () => {
  it('names the photo and what to do', () => {
    expect(photoUploadProblem('KS-ANR-1.jpg', new TypeError('Failed to fetch'))).toBe('KS-ANR-1.jpg did not upload: the connection dropped. Try again.')
    expect(photoUploadProblem('KS-ANR-1.jpg', new Error('Vercel Blob: Access denied, please provide a valid token for this resource.')))
      .toBe('KS-ANR-1.jpg was refused by photo storage. Try again, or send us this: Access denied, please provide a valid token for this resource.')
    expect(photoUploadProblem('a.jpg', new Error('Vercel Blob: Cannot use public access on a private store'))).toMatch(/^Photo storage is set to private/)
    expect(photoUploadProblem('a.jpg', new Error('a.jpg is over 25 MB.'))).toBe('a.jpg is over 25 MB.')
    expect(photoUploadProblem('a.jpg', 'odd')).toBe('a.jpg could not be uploaded.')
  })
  it('keeps storage\'s message short', () => {
    expect(photoUploadProblem('a.jpg', new Error(`Vercel Blob: ${'x'.repeat(500)}`)).length).toBeLessThan(200)
  })
})
