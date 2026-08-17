import { readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

/**
 * Clear a project's vault so the next `analyze` is cold — WITHOUT deleting the directory.
 *
 * Every oracle used to run `rmSync('<project>/.conducks', { recursive: true })`, and two of them run
 * against conducks itself. `.conducks/` is ignored except for ONE carve-out (`.gitignore:51`):
 * `note-reviews.json`, which records which module-note claims a person has read and against which
 * hash of the cited code. So every `npm run oracle` deleted a committed file, and the next
 * `git add -A` committed the deletion.
 *
 * It happened at least twice: commit 86ebe8c (a TS/JSX parser fix) and again inside the todo31
 * commit. Neither noticed, because the reader treats a missing file as "never stamped" — so
 * `visuals-lint` printed `✓ clean` with its stamp check silently doing nothing. An absent warning
 * reads exactly like a passing one.
 *
 * A cold vault needs the DATABASE gone, not the directory. Anything that is not vault state stays.
 */
const KEEP = new Set(['note-reviews.json']);

export const resetVault = (projectDir) => {
  const dir = path.join(projectDir, '.conducks');
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;                       // no vault yet — nothing to clear, and nothing to protect
  }
  for (const entry of entries) {
    if (KEEP.has(entry)) continue;
    rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
};
