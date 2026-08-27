import { readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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
/**
 * ASK GIT WHAT IS TRACKED, rather than naming it.
 *
 * The hardcoded list below was derived from THIS repository's `.gitignore` carve-out, and it was
 * correct for the two oracles that ran against conducks itself. It stopped being correct the moment
 * an oracle was pointed at another project: `oracle-python-dead.mjs` runs against the sofie subject,
 * which commits `.conducks/dependency-graph.html` and `.conducks/overview.html`, and the first run
 * deleted both — the same defect this file was written to fix, recurring because the fix named files
 * instead of asking.
 *
 * `git ls-files` is the exact answer, per project, and it maintains itself. The literal stays as a
 * fallback for a project that is not a git repository at all, where nothing can be tracked and the
 * carve-out costs nothing.
 */
const KEEP = new Set(['note-reviews.json']);

const trackedEntries = (projectDir) => {
  try {
    const out = execFileSync('git', ['ls-files', '.conducks'], {
      cwd: projectDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    // Top-level entry names only: this loop deletes entries of `.conducks`, so a tracked file nested
    // deeper protects the directory that holds it.
    return new Set(out.split('\n').filter(Boolean)
      .map(rel => rel.split('/')[1]).filter(Boolean));
  } catch {
    return new Set();             // not a git repo, or git absent — nothing is tracked
  }
};

export const resetVault = (projectDir) => {
  const dir = path.join(projectDir, '.conducks');
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;                       // no vault yet — nothing to clear, and nothing to protect
  }
  const keep = new Set([...KEEP, ...trackedEntries(projectDir)]);
  for (const entry of entries) {
    if (keep.has(entry)) continue;
    rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
};
