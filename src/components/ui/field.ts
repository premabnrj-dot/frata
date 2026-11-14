// =============================================================================
// FILE: src/components/ui/field.ts — THE field style (Neel N0, § Components; it replaced ~25 local copies).
//
// A text field, select or number: 44 px on a phone, 36 from 768 px, 8 px corners, the g500 field edge, 10 px in.
// Read-only (an input or textarea, never a select) is sunk in text 2 and hover darkens the edge, both in neel.css;
// disabled is 45%. Focus (a 2 px neel line at a 1 px gap, the border neel) and a mistake (the bad
// edge and a 3 px halo, tied by aria-invalid and aria-describedby) are drawn once for every field in src/app/neel.css,
// so an inline field gets them too. FIELD_BOX: the same without a height (a textarea, a field sized by its caller).
// =============================================================================

export const FIELD_BOX = 'min-w-0 rounded-md border border-input bg-card px-2.5 text-sm text-foreground disabled:opacity-45'
export const FIELD = `h-11 md:h-9 ${FIELD_BOX}`
