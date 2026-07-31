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

/**
 * Citations and headings were the cheap half. The expensive half is drift between what the standard
 * SAYS and what the parser DOES — a rule the code enforces and the document never mentions. That is
 * how five gate rules went unlisted until 2026-07-28, and it happened again the same week: the prose
 * reference rule (ADR 0075) was built and the standard had to be updated by hand in the same commit,
 * with nothing but discipline making that happen.
 *
 * No regex can compare a paragraph to a parser. These are the two things todo22#P4 identified as
 * mechanically checkable, and they are checked here rather than left as candidates:
 *
 *   1. every checkbox marker the parser accepts is documented
 *   2. every filename the gate special-cases is named in the standard
 *
 * What is still NOT checked, stated so it is a known gap and not an assumed win: whether the
 * standard's DESCRIPTION of a rule matches the rule's behaviour. A marker can be listed with the
 * wrong meaning and this passes.
 */
describe('conducks-docs — the standard names what the code enforces', () => {
  const source = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

  /** The standard's own text, minus fenced examples — the same carve-out `headings()` makes. */
  function prose(): string {
    const out: string[] = [];
    let fence: string | null = null;
    for (const line of readFileSync(STANDARD, 'utf8').split('\n')) {
      const f = /^\s*(```+|~~~+)/.exec(line);
      if (f) {
        if (!fence) fence = f[1][0].repeat(3);
        else if (line.trimStart().startsWith(fence)) fence = null;
        continue;
      }
      if (!fence) out.push(line);
    }
    return out.join('\n');
  }

  /**
   * A marker the parser accepts and the standard never mentions is a state nobody can write on
   * purpose. `[~]` was invented once for todo09, matched no rule, parsed as prose and vanished —
   * the reverse of this failure, and the reason the marker set is closed.
   */
  it('documents every checkbox marker `MARKER_TO_STATE` accepts, in the section that defines them', () => {
    const decl = /const MARKER_TO_STATE[^=]*=\s*\{([^}]*)\}/.exec(source('src/lib/domain/analysis/docs-grammar.ts'));
    expect(decl).not.toBeNull();
    const markers = [...decl![1].matchAll(/(?:"([^"]*)"|'([^']*)'|\b([A-Za-z])\s*):/g)]
      .map(m => m[1] ?? m[2] ?? m[3])
      .filter(m => m !== 'X');           // the uppercase tolerance, documented as a tolerance not a state
    expect(markers.sort()).toEqual([' ', '-', '>', 'x']);

    // Scoped to §5.2 on purpose. "Appears somewhere in the standard" would pass on a marker
    // mentioned only in an aside, which is not the same as a marker that is DEFINED.
    const body = prose();
    const start = body.search(/^#{2,3}\s+§5\.2\s/m);
    expect(start).toBeGreaterThan(-1);
    // Past the END of the heading line, not one character into it: `###` sliced at +1 is still
    // `##`, which re-matches as the next heading and yields an empty section that contains nothing
    // and therefore fails for the wrong reason.
    const rest = body.slice(body.indexOf('\n', start) + 1);
    const end = rest.search(/^#{2,3}\s+§/m);
    const section = end === -1 ? rest : rest.slice(0, end);
    expect(section.length).toBeGreaterThan(200);

    // The TABLE ROWS, not the whole section. "Mentioned in §5.2" passes on a marker named only in
    // the prose underneath — which was the first version of this test, and deleting the `[>]`
    // definition row did not fail it because the paragraph below still discussed `[>]`.
    const rows = section.split('\n').filter(l => l.trimStart().startsWith('|')).join('\n');
    for (const m of markers) expect(rows).toContain(`[${m}]`);
  });

  /**
   * `ROOT_ONLY` and `DERIVED_FILES` are filenames the gate refuses. A name added to either list and
   * not to the standard is a document failing a rule its author had no way to read.
   */
  it('names every file `ROOT_ONLY` and `DERIVED_FILES` special-case', () => {
    const board = source('src/lib/domain/analysis/docs-board.ts');
    const names = (decl: string): string[] => {
      const m = new RegExp(`const ${decl}[^=]*=\\s*\\[([^\\]]*)\\]`).exec(board);
      expect(m).not.toBeNull();
      return [...m![1].matchAll(/"([^"]+)"/g)].map(x => x[1]);
    };
    const rootOnly = names('ROOT_ONLY');
    const derived = names('DERIVED_FILES');
    expect(rootOnly.length).toBeGreaterThan(0);
    expect(derived.length).toBeGreaterThan(0);

    const text = prose();
    for (const n of [...rootOnly, ...derived]) expect(text).toContain(n);
  });
});
