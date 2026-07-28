import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The conducks-docs standard is the one document `docs-lint` cannot govern — it is not one of the
// six linted types and it lives outside `docs/`. So every drift between it and the code was caught
// by a human or not at all, and twice it was not: `docs-grammar.ts` and `docs-lint.ts` both cited
// "conducks-docs §4 grammar" long after the grammar moved to §5, and nothing noticed. These tests
// are the cheap part of that gap — the part a regex can hold. (todo22#P4)

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const STANDARD = path.join(ROOT, 'src/resources/skills/conducks-docs.md');
const SKIP_DIRS = new Set(['node_modules', 'build', 'coverage', '.git', 'completed', 'legacy', 'archive']);

/**
 * The standard's real headings. Fenced blocks are skipped, because it is a document about markdown
 * and its examples are full of `## Phase 1` lines that are illustrations, not sections — the same
 * carve-out the parser itself makes (§5.1).
 */
function headings(): string[] {
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of readFileSync(STANDARD, 'utf8').split('\n')) {
    const f = /^\s*(```+|~~~+)/.exec(line);
    if (f) {
      if (!fence) fence = f[1][0].repeat(3);
      else if (line.trimStart().startsWith(fence)) fence = null;
      continue;
    }
    if (!fence && /^#{2,3}\s/.test(line)) out.push(line.trim());
  }
  return out;
}

/** Every `§N` and `§N.N` the standard actually defines, from its own headings. */
function definedSections(): Set<string> {
  const out = new Set<string>();
  for (const h of headings()) {
    const m = /^#{2,3}\s+§(\d+(?:\.\d+)?)\s/.exec(h);
    if (m) out.add(m[1]);
  }
  return out;
}

/** Every `conducks-docs §N` citation in the repo, outside the standard itself. */
function citations(): Array<{ file: string; section: string }> {
  const out: Array<{ file: string; section: string }> = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir)) {
      if (SKIP_DIRS.has(e)) continue;
      const fp = path.join(dir, e);
      if (statSync(fp).isDirectory()) { walk(fp); continue; }
      if (!/\.(ts|tsx|js|md)$/.test(e) || fp === STANDARD) continue;
      for (const m of readFileSync(fp, 'utf8').matchAll(/conducks-docs(?:\s+skill)?\s+§(\d+(?:\.\d+)?)/g))
        out.push({ file: path.relative(ROOT, fp), section: m[1] });
    }
  };
  for (const top of ['src', 'tests', 'docs', 'config']) walk(path.join(ROOT, top));
  return out;
}

describe('conducks-docs — the standard is citable and its citations resolve', () => {
  it('numbers every section and subsection, with no duplicates', () => {
    const nums = [...definedSections()];
    expect(nums.length).toBeGreaterThan(20);
    expect(new Set(nums).size).toBe(nums.length);
  });

  // A heading with no § is a rule nobody can cite, which is how §6 grew a 150-line
  // subsection that the most-quoted rule in the file lived inside of, unaddressable.
  it('leaves no §-less heading behind', () => {
    expect(headings().filter(h => !/^#{2,3}\s+§/.test(h))).toEqual([]);
  });

  // The failure this file exists for: a citation that still parses, still reads as authoritative,
  // and points at the wrong rule.
  it('resolves every `conducks-docs §N` citation in the repo', () => {
    const defined = definedSections();
    const broken = citations().filter(c => !defined.has(c.section));
    expect(broken).toEqual([]);
  });

  it('is cited at all — a standard nothing points at has already been forgotten', () => {
    expect(citations().length).toBeGreaterThan(0);
  });
});
