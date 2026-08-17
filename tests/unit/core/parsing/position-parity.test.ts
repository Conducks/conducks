import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The ECMAScript family shares one set of use-positions, and this test is what keeps it one set.
 *
 * `typescript`, `tsx` and `javascript` are the same grammar family — tree-sitter-typescript exposes
 * tsx over the same node types, and JavaScript shares every value-position node with both. Their
 * queries were three hand-copied files, and hand-copying drifted: **JavaScript was missing
 * `for_in_statement`** while both siblings had it. Nothing caught that, because nothing compared the
 * three files.
 *
 * Eleven use-positions were added across a single session, each by editing two or three files by
 * hand. A duplicated block that drifts is only found by diffing files nobody diffs; a fix that fails
 * to propagate is invisible. So the patterns now live in `ecmascript-positions.ts` and this test
 * asserts the composition, in both directions:
 *
 *   - every grammar in the family COMPOSES the shared block, and
 *   - no grammar re-INLINES a shared pattern, which is how a "quick local fix" would restart the
 *     drift without anyone noticing.
 *
 * Reads `queries.scm` rather than `queries.ts` since todo31: the patterns are files now, and the
 * composition marker is `;; @include NAME` where it used to be a template-literal interpolation.
 * The claim is unchanged — only where it is written.
 *
 * Scoped to this family deliberately. Python spells the same ideas `list` and
 * `conditional_expression`, Rust uses `::` paths, Go has no ternary at all — sharing across those
 * would mean inventing an abstraction over tree-sitter node types, a second grammar language to
 * maintain for three consumers. The honest boundary is the family that genuinely shares node types.
 */
const LANG_DIR = path.resolve('src/lib/core/parsing/languages');
const read = (rel: string) => fs.readFileSync(path.join(LANG_DIR, rel), 'utf8');

const VALUE_FAMILY = ['typescript', 'tsx', 'javascript'];
const TYPE_FAMILY = ['typescript', 'tsx'];

describe('ECMAScript use-positions are shared, not copied', () => {
  it('every grammar in the family composes the shared VALUE positions', () => {
    const missing = VALUE_FAMILY.filter(l => !read(`${l}/queries.scm`).includes(';; @include EC_VALUE_POSITIONS'));
    expect({ missing }).toEqual({ missing: [] });
  });

  it('every grammar in the family composes the shared DYNAMIC IMPORT capture', () => {
    // `import('./X')` is one node type in all three grammars, and the shape that needs it — a lazy
    // component load — is written the same way in each. A grammar that stops composing this reports
    // every lazily loaded module as "nothing imports this file": measured, 18 on subject-a.
    const missing = VALUE_FAMILY.filter(l => !read(`${l}/queries.scm`).includes(';; @include EC_DYNAMIC_IMPORT'));
    expect({ missing }).toEqual({ missing: [] });
  });

  it('the TypeScript-typed grammars compose the shared TYPE positions', () => {
    const missing = TYPE_FAMILY.filter(l => !read(`${l}/queries.scm`).includes(';; @include TS_TYPE_POSITIONS'));
    expect({ missing }).toEqual({ missing: [] });
  });

  it('javascript does NOT compose the type positions — naming a missing node kills the whole query', () => {
    // A pattern naming a node type the grammar does not have makes the ENTIRE query invalid, which
    // silently drops every file of that language to the regex fallback (ADR 0089). JavaScript has no
    // type syntax, so this is not tidiness, it is the difference between working and silently blind.
    expect(read('javascript/queries.scm')).not.toContain('TS_TYPE_POSITIONS');
  });

  it('no grammar in the family re-inlines a shared pattern', () => {
    // The drift guard. A pattern added back into one file "just for now" is exactly how the three
    // copies diverged in the first place, and it would look harmless in review.
    const shared = ['value-positions', 'dynamic-import', 'param-defaults', 'type-positions']
      .map(f => read(`ecmascript-${f}.scm`)).join('\n');
    const sharedPatterns = (shared.match(/^\s*\([a-z_]+[^\n]*@(ref_value|pulse_type_target)\)+\s*$/gm) ?? [])
      .map(s => s.trim());
    expect(sharedPatterns.length).toBeGreaterThan(15);   // the block is not empty or mis-parsed

    const offenders: string[] = [];
    for (const lang of VALUE_FAMILY) {
      const body = read(`${lang}/queries.scm`);
      for (const pattern of sharedPatterns) {
        if (body.includes(pattern)) offenders.push(`${lang}: ${pattern}`);
      }
    }
    expect({ offenders }).toEqual({ offenders: [] });
  });
});
