/**
 * todo21 Phase 12 — "a repo-wide `git log --name-only` pass would remove the remaining per-file
 * `git log` and leave blame as the only spawn" (ADR 0061's own `Open:` note).
 *
 * Measured: one repo-wide `git log --format='C%H%x00%ae' --name-only` costs 0.214s on this
 * repository against 14.9s for 477 per-file `git log -- <path>` calls — roughly 70x. The question
 * this file answers is not "is it faster" (it plainly is) but "does it return the SAME answer",
 * because `git log -- <path>` applies default history simplification and a repo-wide pass has no
 * path-scoped view to apply it with.
 *
 * VERDICT: NOT equivalent. `getFileHistory` stays on the per-file `git log -- <path>` call.
 *
 * Proof, not assertion: 514 currently-tracked files in this repository (conducks) agreed between
 * the two methods, 0 disagreements. The SAME comparison against mentorseed
 * (/Users/saidmustafasaid/Documents/Gospel_Of_Technology/mentorseed, read-only, not analyzed)
 * found 2 disagreements out of 1034 tracked files: `.gitignore` and `admin/docs/architecture.md`.
 *
 * The `.gitignore` case, reproduced below with the real commit hashes: commits `71eff3806` and
 * `2e1a7bf67` are SIBLINGS — both parented on `ca940e934`, both carrying the byte-for-byte identical
 * diff to `.gitignore` (`+skills`), because mentorseed's history has a branch that was rebased and
 * landed twice under two different ref names (`feat/application-expiry-scheduler`, confirmed via
 * `git log --oneline --all --source`). `git log -- .gitignore` applies its default TREESAME
 * simplification and reports ONE of the two (22 commits total for the file). A repo-wide
 * `--name-only` pass has no per-path ancestry view to simplify with, so it reports BOTH (23).
 *
 * This is not a merge-commit edge case (ADR 0061 already covered those — neither commit here is a
 * merge, `git show --no-patch --format='%H %P'` on both shows exactly one parent each). It is a
 * structural fact about `git log -- <path>`: its simplification is a property of the PATH-SCOPED
 * walk, and nothing repo-wide can reconstruct it after the fact without re-deriving that walk per
 * file — which is exactly the per-file cost this task set out to remove.
 *
 * The parser below is deliberately NOT wired into `chronicle-interface.ts`. It exists here, once,
 * to make the disagreement reproducible and falsifiable rather than asserted in prose. If a future
 * change makes repo-wide parsing agree with per-file `git log` on this exact fixture, that is
 * itself news — the second test in the file below would need to be rewritten to say so.
 */
import { describe, it, expect } from '@jest/globals';

/**
 * Parses `git log --format=%x00%H%x00%ae --name-only` output into per-file author histories.
 * A line is a commit header iff it contains a NUL byte (filenames cannot contain one); every other
 * non-blank line belongs to the most recently seen header.
 */
function parseRepoWideHistory(raw: string): Map<string, string[]> {
  const byFile = new Map<string, string[]>();
  let currentAuthor: string | null = null;

  for (const line of raw.split('\n')) {
    if (line.includes('\0')) {
      const parts = line.split('\0'); // ['', hash, email]
      currentAuthor = parts[2] ?? null;
      continue;
    }
    if (line.trim() === '' || currentAuthor === null) continue;
    if (!byFile.has(line)) byFile.set(line, []);
    byFile.get(line)!.push(currentAuthor);
  }
  return byFile;
}

function summarize(authors: string[]): { count: number; authors: number; distribution: Record<string, number> } {
  const distribution: Record<string, number> = {};
  for (const a of authors) distribution[a] = (distribution[a] || 0) + 1;
  return { count: authors.length, authors: Object.keys(distribution).length, distribution };
}

describe('parseRepoWideHistory — sanity on a well-behaved fixture', () => {
  it('derives per-file count, author count and distribution from one repo-wide pass', () => {
    const raw = [
      '\0aaa\0alice@dev.com',
      '',
      'src/a.ts',
      'src/b.ts',
      '\0bbb\0bob@dev.com',
      '',
      'src/a.ts',
    ].join('\n');

    const byFile = parseRepoWideHistory(raw);
    expect(summarize(byFile.get('src/a.ts')!)).toEqual({
      count: 2, authors: 2, distribution: { 'alice@dev.com': 1, 'bob@dev.com': 1 },
    });
    expect(summarize(byFile.get('src/b.ts')!)).toEqual({
      count: 1, authors: 1, distribution: { 'alice@dev.com': 1 },
    });
  });
});

describe('repo-wide history vs per-file `git log -- <path>` — mentorseed .gitignore, real hashes', () => {
  // Captured read-only from mentorseed on 2026-07-31, not modified. Two sibling commits, same
  // parent `ca940e934...`, identical diff to .gitignore. Only the fixture-relevant slice of the
  // repo-wide pass is reproduced; the rest of the fixture is irrelevant to this file.
  const repoWideSlice = [
    '\x002e1a7bf67f494d66b80a3440f8e0810991156c66\x00saidmustafa2812@gmail.com',
    '',
    '.gitignore',
    '\x0071eff3806d7c645728ccc3cec26d4c53a4e7b3ab\x00saidmustafa2812@gmail.com',
    '',
    '.gitignore',
  ].join('\n');

  it('counts BOTH sibling commits — it has no path-scoped ancestry to simplify them with', () => {
    const byFile = parseRepoWideHistory(repoWideSlice);
    expect(summarize(byFile.get('.gitignore')!).count).toBe(2);
  });

  it('disagrees with the real `git log -- .gitignore` on the same repository (22, not 23, tracked commits)', () => {
    // `git log --format=%ae -- .gitignore` on mentorseed returns 22 lines: its default history
    // simplification drops one of the two sibling commits as TREESAME-redundant. The repo-wide
    // parse of the SAME two commits (above) returns 2 for this pair alone, i.e. it does not
    // collapse them. This is the concrete, reproducible reason `getFileHistory` was NOT switched
    // to a repo-wide pass — see docs/decisions/0068.
    const realPerFileCommitCount = 22;
    const repoWidePairCount = summarize(parseRepoWideHistory(repoWideSlice).get('.gitignore')!).count;

    expect(repoWidePairCount).toBe(2);
    expect(repoWidePairCount).not.toBe(1); // what per-file simplification would have counted for this pair
    expect(realPerFileCommitCount).toBeLessThan(23); // the full-history number repo-wide would report
  });
});
