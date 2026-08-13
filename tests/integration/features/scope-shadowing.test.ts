import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * todo64 — a local declaration wins over an import of the same name, and over a sibling's local.
 *
 * `context.localBindings` is keyed by NAME PER FILE with no notion of scope, so
 * `import { realTarget as shadowed }` made every `shadowed()` in the file resolve to the import —
 * including inside a function declaring its own `const shadowed`. Confirmed by instrumenting the call
 * processor: one lookup, fired twice, right once and wrong once.
 *
 * Driven through a REAL `analyze` rather than a hand-built graph. `dynamic-import-scoped-alias.test.ts`
 * builds its graph by hand and therefore froze the producer's shape at the moment it was written — it
 * went on agreeing with the code for nine days after the parser stopped emitting that shape, and it
 * is why todo64 was first filed with the wrong headline twice.
 */
describe('a local declaration shadows an import of the same name (todo64)', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('scope-shadowing');

    writeFile(repo, 'src/lib.ts', `
export function realTarget(): number { return 1; }
export class Widget { n = 7; }
`);
    writeFile(repo, 'src/main.ts', `
import { realTarget as shadowed, Widget } from './lib.js';

export function usesLocal(): number {
  const shadowed = () => 99;
  return shadowed();
}

export function usesImport(): number {
  return shadowed();
}

export function siblingA(): number {
  const helper = () => 1;
  return helper();
}

export function siblingB(): number {
  const helper = () => 2;
  return helper();
}

// A CASE COLLISION: the imported class is \`Widget\`, the local is \`widget\`. Ids are lowercased
// (CONDUCKS-4) so both are \`…::widget\` — indistinguishable without comparing the names as written.
export function makesWidget(): number {
  const widget = 5;
  return new Widget().n + widget;
}
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });

    // The fixture analyzed at all — otherwise every assertion below passes on an empty graph.
    expect(JSON.parse(runCli(['query', '*', '--json'], { cwd: repo }).stdout).length).toBeGreaterThan(0);
  }, 180000);

  afterAll(() => rmRepo(repo));

  it('resolves the call to the LOCAL, not to the import it shadows', () => {
    const impact = JSON.parse(
      runCli(['impact', 'realTarget', 'upstream', '--json'], { cwd: repo }).stdout
    );
    const callers = JSON.stringify(impact).toLowerCase();

    // `usesImport` calls through the import and must still reach it — ADR 0085's case, and the half
    // that a careless fix here would break.
    expect(callers).toContain('usesimport');

    // `usesLocal` calls its OWN arrow function. Before todo64 it was recorded as calling realTarget,
    // so `impact` answered with a caller that does not call — the worst class this graph produces.
    expect(callers).not.toContain('useslocal');
  }, 180000);

  it('does not rebind across a case difference, which ids alone cannot see', () => {
    // Ids are lowercased for APFS (CONDUCKS-4), so the imported class `Widget` and the local `widget`
    // share one id shape. The first cut of this fix matched on the lowered id and rebound 37 edges on
    // the python subject — `pathlib::Path` onto a local `path`, `graph.py::Node` onto a local `node`.
    // The names as WRITTEN are compared now, so `makesWidget` must still reach `Widget`.
    const impact = JSON.parse(
      runCli(['impact', 'Widget', 'upstream', '--json'], { cwd: repo }).stdout
    );
    expect(JSON.stringify(impact).toLowerCase()).toContain('makeswidget');
  }, 180000);
});
