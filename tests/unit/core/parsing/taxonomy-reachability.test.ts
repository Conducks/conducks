import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CanonicalKind, CanonicalRank, mapToCanonical } from '@/lib/core/parsing/taxonomy.js';

/**
 * ADR 0100 — every declared kind has a producer.
 *
 * This test used to assert the OPPOSITE and pass: it pinned that NAMESPACE, STATEMENT, BRANCH and
 * DATA were unreachable, and treated four kinds nothing could emit as a documented state of
 * affairs. It was a faithful description of a defect. A declared kind that no grammar produces is
 * not a reservation — it is a claim the graph cannot honour, and it cost real work: the taxonomy
 * legend advertised rungs no node could stand on, and PACKAGE's only two nodes on this repository
 * were a C# and a PHP `namespace` wearing the wrong kind.
 *
 * The direction is now inverted. A kind must be reachable, and the test names HOW.
 */

const LANGUAGES_DIR = join(process.cwd(), 'src/lib/core/parsing/languages');

function allQueryFiles(): { path: string; source: string }[] {
  return readdirSync(LANGUAGES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(LANGUAGES_DIR, e.name, 'queries.ts'))
    .map((path) => ({ path, source: readFileSync(path, 'utf8') }));
}

/**
 * The capture tag(s) that produce each kind, or the non-grammar producer that does.
 *
 * A kind reached only from code (not from a tree-sitter capture) names the file instead — those
 * are just as real, and leaving them out would make the check look stricter than it is.
 */
const PRODUCERS: Record<CanonicalKind, { tags?: RegExp; via?: string }> = {
  [CanonicalKind.ECOSYSTEM]:  { via: 'graph-skeleton-builder.ts + reflection-pipeline.ts (boundary nodes)' },
  [CanonicalKind.REPOSITORY]: { via: 'graph-skeleton-builder.ts' },
  [CanonicalKind.PACKAGE]:    { tags: /@isPackage\b/ },
  [CanonicalKind.NAMESPACE]:  { tags: /@isNamespace\b/ },
  [CanonicalKind.DIRECTORY]:  { via: 'graph-skeleton-builder.ts' },
  [CanonicalKind.UNIT]:       { via: 'graph-skeleton-builder.ts + reflector.ts' },
  [CanonicalKind.INFRA]:      { tags: /@isInfra\b|@isMacro\b/ },
  [CanonicalKind.STRUCTURE]:  { tags: /@isClass\b|@isInterface\b|@isStruct\b|@isEnum\b/ },
  [CanonicalKind.BEHAVIOR]:   { tags: /@isFunction\b|@isMethod\b/ },
  [CanonicalKind.ATOM]:       { tags: /@isVariable\b|@isProperty\b|@isField\b/ },
};

describe('every declared kind has a producer', () => {
  const files = allQueryFiles();

  it('found at least 13 language query files (guards against a silently empty scan)', () => {
    expect(files.length).toBeGreaterThanOrEqual(13);
  });

  for (const kind of Object.values(CanonicalKind) as CanonicalKind[]) {
    const producer = PRODUCERS[kind];
    if (!producer.tags) {
      it(`${kind} is produced in code — ${producer.via}`, () => {
        expect(producer.via).toBeTruthy();
      });
      continue;
    }
    it(`${kind} is tagged by at least one grammar`, () => {
      const emitters = files.filter((f) => producer.tags!.test(f.source)).map((f) => f.path);
      expect(emitters.length).toBeGreaterThan(0);
    });
  }

  /**
   * The repair, pinned at both ends. C++/C#/PHP/Rust declare a language SCOPE and Go/Java declare a
   * deployable UNIT; all six were `@isPackage`, which is the whole reason NAMESPACE had no nodes
   * and PACKAGE had two wrong ones.
   */
  it('namespace-shaped grammars tag @isNamespace, package-shaped ones tag @isPackage', () => {
    const has = (frag: string, re: RegExp) =>
      files.some((f) => f.path.includes(`/${frag}/`) && re.test(f.source));

    for (const lang of ['cpp', 'csharp', 'php', 'rust']) {
      expect({ lang, isNamespace: has(lang, /@isNamespace\b/) }).toEqual({ lang, isNamespace: true });
      expect({ lang, isPackage: has(lang, /@isPackage\b/) }).toEqual({ lang, isPackage: false });
    }
    for (const lang of ['go', 'java']) {
      expect({ lang, isPackage: has(lang, /@isPackage\b/) }).toEqual({ lang, isPackage: true });
    }
  });

  /**
   * The five names the cut removed must stay unproducible, or the cut was wrong. A capture for any
   * of them turns this red BEFORE the grammar change ships — which is the point: the decision to
   * have no STATEMENT node is a decision, and it should be re-opened deliberately, not by a query
   * edit nobody connected to it.
   */
  it('no grammar tags a statement, branch, parameter, argument or literal', () => {
    const re = /@isStatement\b|@isBranch\b|@isParameter\b|@isArgument\b|@isLiteral\b/;
    expect(files.filter((f) => re.test(f.source)).map((f) => f.path)).toEqual([]);
  });
});

describe('mapToCanonical after the cut', () => {
  it('module / namespace -> NAMESPACE', () => {
    expect(mapToCanonical('module').kind).toBe(CanonicalKind.NAMESPACE);
    expect(mapToCanonical('namespace').kind).toBe(CanonicalKind.NAMESPACE);
  });

  it('package / workspace_package -> PACKAGE', () => {
    expect(mapToCanonical('package').kind).toBe(CanonicalKind.PACKAGE);
    expect(mapToCanonical('workspace_package').kind).toBe(CanonicalKind.PACKAGE);
  });

  it('route / controller / infra / macro -> INFRA', () => {
    for (const k of ['route', 'controller', 'infra', 'macro']) {
      expect(mapToCanonical(k).kind).toBe(CanonicalKind.INFRA);
    }
  });

  /**
   * The five cut names fall to the ATOM default, where the edge gate removes them. That is the
   * same outcome DATA reached via a kind that existed only to be deleted — one fewer rung, same
   * behaviour. Asserted rather than assumed, because "it falls through to the default" is exactly
   * the kind of claim that stops being true when someone adds a branch above it.
   */
  it('parameter / argument / literal / statement / branch fall to ATOM, which the edge gate removes', () => {
    for (const k of ['parameter', 'argument', 'literal', 'statement', 'if_statement', 'switch_case']) {
      expect(mapToCanonical(k).kind).toBe(CanonicalKind.ATOM);
    }
  });

  it('the ladder is dense, ordered, and ten rungs', () => {
    const ranks = (Object.values(CanonicalKind) as CanonicalKind[]).map((k) => CanonicalRank[k]);
    expect(ranks).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
