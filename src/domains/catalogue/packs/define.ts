/**
 * Makes a pack, a shared line or the list as a call the bundler can see is pure (`/*#__PURE__*\/ pure(() => ({ … }))`).
 * Webpack counts a top-level object literal as a side effect, and a module with one is kept wherever it is imported,
 * even for nothing: policies/answers.ts imports render.ts in the browser for a constant, and the packs came with it
 * (C1a·3: Content's first load grew 3.5 kB). Through `pure`, an unused import of the packs is dropped.
 */
export const pure = <const T>(make: () => T): T => make()
