/**
 * todo53 Phase 1 — `conducks_diff` reported `totalImpacted: 0` for a working tree holding 15 changed
 * files, at the same moment the CLI's PR risk engine reported "Analyzed 15 hunks. 7 symbols impacted"
 * against the same repository and the same graph.
 *
 * The tool did not share the CLI's engine — it had its own hand-rolled copy, and every one of the
 * three steps was wrong in a different way:
 *
 *   1. `git diff -U0` — no `HEAD`, so STAGED changes are invisible. ADR 0122 fixed exactly this in
 *      the CLI; the tool's copy never got it.
 *   2. no `git ls-files --others`, so UNTRACKED files are invisible. Fixed in the CLI on 2026-08-08
 *      after the same blind spot was found in `watch` (todo51); the tool's copy never got that either.
 *   3. the symbol matcher asked `lineStart <= line && lineStart + (complexity || 1) >= line`.
 *      `complexity` is a cyclomatic count, NOT a line span, so the end of every symbol was a
 *      fabricated number — which is why the answer was 0 even for the tracked, unstaged files that
 *      step 1 DID see.
 *
 * Three copies of one rule, drifting apart, is the failure this codebase keeps paying for. The rule
 * now lives in `change-set.ts` and both surfaces call it, so a fix to one cannot miss the other.
 */
import { describe, it, expect } from '@jest/globals';
import { parseDiffHunks, impactedSymbolIds } from '@/lib/domain/analysis/change-set.js';

const ROOT = '/repo';

describe('parseDiffHunks — a hunk becomes a file and the lines it touched', () => {
  it('reads the changed line numbers out of a -U0 diff', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -10,0 +11,3 @@',
      '+one', '+two', '+three',
    ].join('\n');
    expect(parseDiffHunks(diff, ROOT)).toEqual([{ file: '/repo/src/a.ts', lines: [11, 12, 13] }]);
  });

  it('defaults a hunk with no count to a single line', () => {
    const diff = ['+++ b/src/a.ts', '@@ -4 +4 @@'].join('\n');
    expect(parseDiffHunks(diff, ROOT)).toEqual([{ file: '/repo/src/a.ts', lines: [4] }]);
  });

  it('drops a file whose hunks touched no lines, rather than reporting it as changed', () => {
    expect(parseDiffHunks('+++ b/src/a.ts', ROOT)).toEqual([]);
  });

  it('refuses a path that escapes the repository root', () => {
    expect(() => parseDiffHunks('+++ b/../../etc/passwd\n@@ -1 +1 @@', ROOT)).toThrow(/outside repository root/);
  });
});

describe('impactedSymbolIds — a changed line hits the symbol whose RANGE holds it', () => {
  const nodes = [
    { id: 'a::big', properties: { filePath: '/repo/src/a.ts', complexity: 1, range: { start: { line: 10 }, end: { line: 90 } } } },
    { id: 'a::small', properties: { filePath: '/repo/src/a.ts', complexity: 1, range: { start: { line: 95 }, end: { line: 97 } } } },
    { id: 'b::other', properties: { filePath: '/repo/src/b.ts', complexity: 1, range: { start: { line: 1 }, end: { line: 50 } } } },
  ];

  it('matches a line deep inside a long symbol', () => {
    // The defect in one assertion: under `lineStart + (complexity || 1)` this symbol ended at line 11,
    // so a change at line 80 — plainly inside a function spanning 10..90 — matched nothing.
    expect(impactedSymbolIds(nodes as any, [{ file: '/repo/src/a.ts', lines: [80] }])).toEqual(['a::big']);
  });

  it('matches on the exact file, never a suffix of another path', () => {
    const shadow = [{ id: 'vendor::x', properties: { filePath: '/repo/vendor/src/a.ts', complexity: 1, range: { start: { line: 1 }, end: { line: 99 } } } }];
    expect(impactedSymbolIds([...nodes, ...shadow] as any, [{ file: '/repo/src/a.ts', lines: [80] }])).toEqual(['a::big']);
  });

  it('returns each symbol once even when many of its lines changed', () => {
    expect(impactedSymbolIds(nodes as any, [{ file: '/repo/src/a.ts', lines: [10, 20, 30, 40] }])).toEqual(['a::big']);
  });

  it('collects across files', () => {
    const hit = impactedSymbolIds(nodes as any, [
      { file: '/repo/src/a.ts', lines: [96] },
      { file: '/repo/src/b.ts', lines: [2] },
    ]);
    expect(hit.sort()).toEqual(['a::small', 'b::other']);
  });

  it('reports nothing for a change in a file the graph does not hold', () => {
    expect(impactedSymbolIds(nodes as any, [{ file: '/repo/src/never.ts', lines: [1] }])).toEqual([]);
  });

  it('ignores a node with no range rather than inventing one from complexity', () => {
    const rangeless = [{ id: 'a::rangeless', properties: { filePath: '/repo/src/a.ts', complexity: 40 } }];
    expect(impactedSymbolIds(rangeless as any, [{ file: '/repo/src/a.ts', lines: [5] }])).toEqual([]);
  });
});
