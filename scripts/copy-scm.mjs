/**
 * Copy every `.scm` beside its compiled module (todo31).
 *
 * `tsc` emits `.js` and nothing else, so a query file co-located with its pack would be missing from
 * `build/` and every language would throw ENOENT on first parse. This mirrors `src/**\/*.scm` into
 * `build/src/` keeping the relative path, because the loader resolves against `import.meta.url` —
 * the file has to sit beside the module, not in a resources directory.
 *
 * IT REFUSES A RUN THAT COPIED NOTHING. A silent zero here would produce a build whose packs all
 * throw at runtime while the build itself reported success — the shape ADR 0044 names, and the shape
 * this repository has been caught by more than once.
 */
import { readdirSync, statSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';

const walk = (dir) => readdirSync(dir).flatMap((entry) => {
  const full = path.join(dir, entry);
  return statSync(full).isDirectory() ? walk(full) : full.endsWith('.scm') ? [full] : [];
});

const found = walk('src');
for (const from of found) {
  const to = path.join('build', from);
  mkdirSync(path.dirname(to), { recursive: true });
  copyFileSync(from, to);
}

if (found.length === 0) {
  console.error('✖ copy-scm: no .scm file found under src/ — the packs read their patterns from disk, so a build with none is a build that cannot parse.');
  process.exit(1);
}
console.log(`  copied ${found.length} query file(s) beside their compiled modules`);
