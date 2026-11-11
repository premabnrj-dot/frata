/** After a write: refresh now, and once more a moment later. The action's own re-render and this refresh race, and the
 *  older one can land last (frata-gotchas); a second refresh always carries the newest state, and changes nothing if
 *  the first was right. */
export function settle(router: { refresh: () => void }) {
  router.refresh()
  setTimeout(() => router.refresh(), 700) // clock-ok: in a handler or timer, never at render
}
