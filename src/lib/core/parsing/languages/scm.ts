import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Read a tree-sitter query file that sits beside its pack (todo31).
 *
 * The patterns used to live in TypeScript template literals, where a BACKTICK terminates the string.
 * A backtick is ordinary prose in a `;;` comment — it is how a grammar node gets named — so writing
 * one broke the build with `TS1005: ',' expected` pointing at query text. It happened ten times in
 * ten days and needed a pre-build gate (`check-query-backticks.mjs`) to be survivable at all.
 *
 * Resolved against the CALLER'S `import.meta.url`, never `process.cwd()` or a path from the repo
 * root. That is the whole reason this works in the three places a pack gets loaded, which is the
 * risk this migration was deferred on for twelve days and which was measured before it was done:
 *
 *   jest            `import.meta.url` is the SOURCE module, so the file beside it is `src/…`
 *   built CLI       it is the compiled module, so the file beside it is `build/src/…`
 *   pulse worker    a separate PROCESS with its own cwd — and it still resolves, because the anchor
 *                   is the module's own location and not the process's
 *
 * `scripts/copy-scm.mjs` puts the file beside the compiled module, and fails a build that copied
 * none rather than shipping packs that all throw on first parse.
 */
export const scm = (moduleUrl: string, file: string, shared: Record<string, string> = {}): string => {
  const raw = readFileSync(fileURLToPath(new URL(file, moduleUrl)), 'utf8');

  // `;; @include EC_VALUE_POSITIONS` splices a shared block in PLACE. Three packs need it and the
  // position is not cosmetic: javascript carries patterns AFTER its shared blocks, and two patterns
  // matching the same node race to create it (ADR 0086), so appending everything at the end would
  // change which one wins. The marker is a `;;` comment, so the file is still a legal query file
  // when read raw — it is merely missing the shared half, which the line itself names.
  //
  // An UNKNOWN name throws. Silently leaving the marker in place would drop every shared pattern in
  // that pack while the query still compiled, which is precisely the failure `ecmascript-positions`
  // was created to end: javascript was missing `for_in_statement` for months because nothing
  // compared the three copies.
  return raw.replace(/^;; @include (\w+)$/gm, (_line, name: string) => {
    const part = shared[name];
    if (part === undefined) {
      throw new Error(`[Conducks] ${file} includes '${name}', which the pack did not provide.`);
    }
    return part;
  });
};
