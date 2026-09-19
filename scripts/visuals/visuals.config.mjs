// The only things about these visuals that are local to this repo.
//
// REPO-LOCAL (conducks-visuals §0). `render.mjs`, `detail.mjs`, `notes.mjs`, `note-map.mjs`,
// `_chrome.html`, `system.css` and `system.js` are shared byte-for-byte with every other repo built
// to these rules; these two facts are not. Both used to live inside the shared renderers, which
// meant a shared file had to be edited on arrival — and a file edited on arrival is not shared.
export const REPO = 'Conducks';

// Containers already covered by a hand-written page. A container earns a place in this set when its
// page needs prose the graph cannot carry, never to make a page look fuller.
//
// `c_bench` — `docs/visuals/modules/bench.md` is now the authored source for the benchmark feature
// (ADR 0193); the container's own generated detail page collided with it byte-for-byte on
// `bench.html`, and the note is the one meant to win.
export const HAND_WRITTEN = new Set(['c_bench']);
