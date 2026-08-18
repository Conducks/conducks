import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * `export default Foo` records an ALIASES edge from `<file>::default` — and that source node was
 * never minted, so the graph held an edge coming from a node it does not contain.
 *
 * conducks caught this about itself: `audit` reported
 * `REFACTOR-2: Edge from a node that does not exist: [x.tsx::default] -> [x.tsx::foo] (ALIASES)`
 * **96 times on the sofie subject and 87 times on the orchestrator** — one per default-exporting
 * component file — and those rows drowned the two real circular-dependency findings they were
 * printed beside. A checker firing correctly on a defect in its own producer.
 *
 * The node is minted now. It is kinded ATOM and not exported, because `default` is a NAME and not a
 * declaration: the symbol it aliases is judged on its own row, and `prune` must not gain a finding
 * per component file. Verified on both subjects — prune counts unchanged (141 and 239), orphaned
 * synapses 96→34 and 87→0, the residue being an unrelated scope-naming defect.
 */
describe('a default export has a node, not just an edge', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('default-export-node');

    writeFile(repo, 'src/Panel.tsx', `
export function Panel(): number { return 1; }
export default Panel;
`);
    writeFile(repo, 'src/Widget.tsx', `
function Widget(): number { return 2; }
export default Widget;
`);
    writeFile(repo, 'src/main.ts', `
import Panel from './Panel.js';
import Widget from './Widget.js';
export function boot(): number { return Panel() + Widget(); }
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 180000);

  afterAll(() => rmRepo(repo));

  it('audit reports no edge from a non-existent node', () => {
    const out = runCli(['audit'], { cwd: repo, allowFail: true }).combined;
    expect(out).not.toContain('Edge from a node that does not exist');
  }, 180000);

  it('does not add a prune finding per default-exporting file', () => {
    // `default` is a name, not a declaration. If the minted node were treated as a symbol, every
    // component file in a React codebase would gain a dead-code finding.
    const findings = JSON.parse(runCli(['prune', '--json'], { cwd: repo }).stdout);
    expect(findings.map((f: any) => f.symbol)).not.toContain('default');
  }, 180000);

  it('keeps the alias chain intact, which is what the edge exists for', () => {
    // A default IMPORT can only name `<module>::default`, and this edge is how that id reaches the
    // declaration it stands for. The chain resolves to the importing MODULE (`main.ts`), not to the
    // calling function inside it — default-import call sites bind at unit granularity, which is
    // pre-existing behaviour and not what minting the node claims to change. Asserted as it is
    // rather than as one would wish it: `impact` must reach the consumer, through the alias.
    const impact = JSON.parse(runCli(['impact', 'Panel', 'upstream', '--json'], { cwd: repo }).stdout);
    expect(impact.affectedCount).toBeGreaterThan(0);
    expect(JSON.stringify(impact).toLowerCase()).toContain('main.ts');
  }, 180000);
});
