import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * A flow's member list includes everything the walk reached, and the graph deliberately holds nodes
 * for things this project does not own: built-ins (`global::set`), package namespaces
 * (`react::usestate`) and unresolved targets (`external://unresolved/os.uptime`). Keeping them is
 * right — they are real reach. COUNTING them as project symbols is not.
 *
 * MEASURED on the sofie subject: 2,071 of 23,042 flow members (8%) were synthesised, and
 * `--min-members` filtered on the inflated total — so a "flow" of five built-ins satisfied a floor
 * whose entire purpose is removing noise. On the orchestrator, 45 flows cleared `--min-members 2`
 * only on non-project members.
 *
 * The full list is still carried and still printed; only the count a caller filters and reads by is
 * now the project count, with the remainder stated rather than dropped.
 */
describe('flows counts this project\'s symbols', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('flows-project-members');

    // A REAL chain of four project symbols.
    writeFile(repo, 'src/chain.ts', `
export function stepOne(): number { return stepTwo(); }
export function stepTwo(): number { return stepThree(); }
export function stepThree(): number { return stepFour(); }
export function stepFour(): number { return 4; }
`);
    // A function whose reach is almost entirely BUILT-INS — the shape that used to clear the floor.
    writeFile(repo, 'src/builtins.ts', `
export function mostlyBuiltins(xs: number[]): string {
  const a = xs.map(x => x + 1).filter(Boolean).slice(0, 2);
  return JSON.stringify(a).trim().toUpperCase().padStart(8, '0');
}
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 180000);

  afterAll(() => rmRepo(repo));

  const flows = (args: string[] = []) =>
    JSON.parse(runCli(['flows', '--json', ...args], { cwd: repo }).stdout);

  it('reports project and external members separately', () => {
    const d = flows();
    expect(d.flows.length).toBeGreaterThan(0);
    for (const f of d.flows) {
      expect(typeof f.project_members).toBe('number');
      expect(typeof f.external_members).toBe('number');
    }
  }, 180000);

  it('actually classifies — some member of this fixture IS external', () => {
    // Without this the suite passes with the classifier stubbed to "everything is a project symbol",
    // which is how the first version of this test was written and how it was caught: the fixture
    // above must contain built-ins for the other assertions to mean anything.
    const d = flows();
    const external = d.flows.reduce((n: number, f: any) => n + f.external_members, 0);
    expect(external).toBeGreaterThan(0);

    const anyExternalId = d.flows
      .flatMap((f: any) => f.symbols as string[])
      .some((id: string) => id.startsWith('global::') || id.includes('://') || !id.includes('::'));
    expect(anyExternalId).toBe(true);
  }, 180000);

  it('loses no member — the two counts still add up to the full list', () => {
    // The counter-test for "did the fix DROP data". Externals are excluded from the COUNT, never
    // from the list: `impact` reports the same reach and a reader may want it.
    const d = flows();
    for (const f of d.flows) {
      expect(f.project_members + f.external_members).toBe(f.symbols.length);
    }
  }, 180000);

  it('applies --min-members to the project count, not the inflated total', () => {
    const d = flows(['--min-members', '3']);
    for (const f of d.flows) expect(f.project_members).toBeGreaterThanOrEqual(3);
  }, 180000);

  it('still finds a genuine multi-symbol flow', () => {
    // The other counter-test: a filter that removed everything would satisfy the case above while
    // destroying the command.
    const d = flows(['--min-members', '3']);
    const names = d.flows.map((f: any) => f.name.toLowerCase());
    expect(names.some((n: string) => n.includes('stepone'))).toBe(true);
  }, 180000);

  it('states the denominator, as it always did', () => {
    const d = flows();
    expect(typeof d.total).toBe('number');
    expect(typeof d.matching).toBe('number');
    expect(d.matching).toBeLessThanOrEqual(d.total);
  }, 180000);
});
