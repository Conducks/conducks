import { describe, it, expect, beforeAll, afterEach } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ConducksReflector } from "@/lib/core/parsing/index.js";
import { AnalyzeContext } from "@/lib/core/parsing/index.js";
import { chronicle } from '@/lib/core/git/index.js';

/**
 * todo21 Phase 1 — a `fingerprint` is a STRUCTURAL identity, so it must not encode where the
 * repository happens to sit on this disk.
 *
 * All four fingerprint sites in reflector.ts hashed the ABSOLUTE `file.path`. Measured on two real
 * layers of this repo's vault: `fingerprint` differed on 82.8% of rows across UNCHANGED files while
 * `dna` — its only content input — was identical on 3,613 of 3,613. The churn was entirely the path
 * term. Two things broke:
 *
 *  1. A vault was not portable: clone or move the checkout and every symbol read as new.
 *  2. Rename/move detection could never fire. `drift-engine.ts:69` joins
 *     `c.fingerprint = p.fingerprint AND c.nodeId != p.nodeId` — "same structure, different
 *     location" — and a move changes the path, hence the fingerprint, so the join matched nothing
 *     BY CONSTRUCTION.
 *
 * THE ACCEPTANCE IS NOT "the hash changed". It is: the same tree analyzed from two DIFFERENT
 * absolute roots produces IDENTICAL fingerprints. Every test below is paired with a CONTROL that
 * moves the file to a different position INSIDE the root and asserts the fingerprint DOES change —
 * without that control, a fix that simply dropped the path term entirely would pass, and two
 * same-named symbols in different directories would then collide.
 */

const SOURCE = [
  'export async function handler(req, res) { res.send("ok"); }',
  'export class Widget { run() { return 1; } }',
].join('\n');

// The native tree-sitter binding cannot be driven from inside jest's VM, so the native path runs in
// a child — the same shape tests/unit/domain/evolution/fingerprint-coverage.test.ts already uses.
const CHILD = `
(async () => {
  const [filePath, source] = JSON.parse(process.argv[1]);
  const { ConducksReflector } = await import('./src/lib/core/parsing/reflector.ts');
  const { AnalyzeContext } = await import('./src/lib/core/parsing/context.ts');
  const { grammars } = await import('./src/lib/core/parsing/grammar-registry.ts');
  const { TypeScriptProvider } = await import('./src/lib/core/parsing/languages/typescript/index.ts');

  await grammars.loadLanguage('typescript');
  const file = { path: filePath, source };
  const s = await new ConducksReflector().reflect(file, new TypeScriptProvider(), new AnalyzeContext(), [file.path]);

  console.log('__RESULT__' + JSON.stringify(
    s.nodes.map((n) => ({ name: n.name, fingerprint: (n.metadata && n.metadata.fingerprint) ?? null }))
  ));
})();
`;

type Sym = { name: string; fingerprint: string | null };

/** Reflect `source` as if it lived at `<root>/<relative>`, with the project anchored at `root`. */
function reflectNativeAt(root: string, relative: string): Map<string, string> {
  const tsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
  const out = execFileSync(tsx, ['-e', CHILD, JSON.stringify([path.join(root, relative), SOURCE])], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    // chronicle reads this at construction; it is what `structuralPath` relativises against.
    env: { ...process.env, CONDUCKS_WORKSPACE_ROOT: root },
  });
  const line = out.split('\n').find(l => l.includes('__RESULT__'));
  if (!line) throw new Error(`reflect child produced no result:\n${out}`);
  const nodes: Sym[] = JSON.parse(line.slice(line.indexOf('__RESULT__') + '__RESULT__'.length));
  return new Map(nodes.filter(n => n.fingerprint).map(n => [n.name, n.fingerprint!]));
}

// Two roots that share NO common shape: different depth, different names, different parents.
const ROOT_A = '/tmp/conducks-fp/checkout-a';
const ROOT_B = '/var/somewhere/else/deeper/checkout-b';
const REL = 'src/lib/widget.ts';
const REL_MOVED = 'src/other/widget.ts';

describe('fingerprint is portable — native path', () => {
  let atA: Map<string, string>;
  let atB: Map<string, string>;
  let moved: Map<string, string>;

  beforeAll(() => {
    atA = reflectNativeAt(ROOT_A, REL);
    atB = reflectNativeAt(ROOT_B, REL);
    moved = reflectNativeAt(ROOT_A, REL_MOVED);
  }, 120_000);

  it('produces fingerprints at all (guards against a vacuously empty comparison)', () => {
    expect(atA.size).toBeGreaterThan(0);
    expect([...atA.keys()].sort()).toEqual([...atB.keys()].sort());
  });

  it('the SAME tree at two DIFFERENT absolute roots gives IDENTICAL fingerprints', () => {
    // This is the acceptance. Before the fix every entry differed, because the absolute root was
    // hashed in.
    expect(Object.fromEntries(atA)).toEqual(Object.fromEntries(atB));
  });

  it('CONTROL — moving the file INSIDE the root still changes the fingerprint', () => {
    // Without this, "delete the path term" would pass the test above while making two same-named
    // symbols in different directories collide.
    for (const [name, fp] of atA) {
      expect(moved.get(name)).toBeDefined();
      expect(moved.get(name)).not.toEqual(fp);
    }
  });
});

// REMOVED with the Gnosis regex fallback itself (ADR 0089). It covered the same two cases as the
// native describe above — identical fingerprints at two roots, plus the control that a move INSIDE
// the root does change one — through a code path that no longer exists. The property is still
// pinned, by the native tests, which is what actually runs.
