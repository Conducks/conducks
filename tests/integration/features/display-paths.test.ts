import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * What a command PRINTS must be a path the reader can open, and must not repeat the machine's home
 * directory on every row.
 *
 * Ids are lowercased absolute paths (CONDUCKS-4, for APFS), and the commands here printed them raw:
 *
 *  - `prune` named `renderer/src/lib/useworkgraph.ts` for a file called `useWorkGraph.ts`. That is the
 *    one command whose entire output is a list of files to go and edit, and on a case-sensitive
 *    filesystem the path it names does not exist.
 *  - `flows`, `audit`, `advise`, `trace`, `entry` and `cohesion` each printed the full absolute id per
 *    row: ~83 identical characters before the part that answers the question. MEASURED on the sofie
 *    subject after this fix — `flows` output fell 48%, `audit` 40%, `entry` 31%, `advise` 25%.
 *  - `entry`'s rendered table truncated the path to 52 columns, so every row showed the home
 *    directory and nothing else.
 *
 * The IDS ARE NOT CHANGED. Case-insensitive keys are load-bearing across persistence, the linker and
 * every fixture; only the display is repaired.
 */
describe('commands print pasteable, relative paths', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('display-paths');

    writeFile(repo, 'src/useWorkGraph.ts', `
export interface WorkGraph { n: number }
/** Exported, used by nobody — so prune has something to name. */
export function unusedHelper(): number { return 1; }
`);
    writeFile(repo, 'src/Main.ts', `
import { useWorkGraph } from './useWorkGraph.js';
export function boot(): unknown { return useWorkGraph; }
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });

    expect(JSON.parse(runCli(['query', '*', '--json'], { cwd: repo }).stdout).length).toBeGreaterThan(0);
  }, 180000);

  afterAll(() => rmRepo(repo));

  it('prune --json names a path that exists on disk, in its real case', () => {
    const findings = JSON.parse(runCli(['prune', '--json'], { cwd: repo }).stdout);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(fs.existsSync(f.file)).toBe(true);
    }
    // The specific regression: the file is `useWorkGraph.ts`, not `useworkgraph.ts`.
    expect(findings.some((f: any) => String(f.file).includes('useWorkGraph.ts'))).toBe(true);
  }, 180000);

  it('prune renders paths relative to the project, not absolute', () => {
    const out = runCli(['prune'], { cwd: repo }).stdout;
    expect(out).toContain('src/useWorkGraph.ts');
    expect(out).not.toContain(repo);           // no absolute prefix
    expect(out).not.toContain('useworkgraph'); // no lowercased spelling
  }, 180000);

  it('entry, flows and audit print no absolute project prefix', () => {
    for (const cmd of [['entry'], ['flows'], ['audit']]) {
      const { stdout } = runCli(cmd, { cwd: repo });
      expect(stdout).not.toContain(repo);
    }
  }, 180000);

  it('does not mangle a synthesised external location', () => {
    // `path.join`/`path.resolve` normalise `external://global/fetch` down to `external:/global/fetch`,
    // so the helper whose purpose is pasteable ids was printing an unpasteable one. Caught in `trace`
    // and `impact` output on the sofie subject after the first round of this work.
    const out = runCli(['trace', 'boot'], { cwd: repo, allowFail: true }).combined
      + runCli(['impact', 'boot', 'downstream'], { cwd: repo, allowFail: true }).combined;
    expect(out).not.toMatch(/external:\/[^/]/);
  }, 180000);

  it('leaves synthesised ids alone', () => {
    // `global::set`, `external://…`, `route::/x::get` have no file part. A repair that tried to
    // resolve them against the filesystem would mangle them, and they are how impact reports
    // unresolved externals.
    const out = runCli(['trace', 'boot'], { cwd: repo }).stdout + runCli(['flows'], { cwd: repo }).stdout;
    expect(out).not.toMatch(/global::[a-z]+\//);
  }, 180000);
});
