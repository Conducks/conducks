import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * ADR 0114 — `list` and `link` are one feature and are scored together.
 *
 * `link` writes `<root>/.conducks/links.json` and `list` is its only reader, so testing either alone
 * tests half of it. Two defects lived in the seam:
 *
 *   - `getLinks()` was `try { JSON.parse(...) } catch { return [] }`, so a CORRUPT link list read as
 *     an empty one. `list` printed "No federated projects linked." and exited 0 on a workspace whose
 *     links were merely unparseable.
 *   - `link` verifies the target holds a synapse at the moment it writes, and nothing ever looked
 *     again — a deleted project listed exactly like a live one.
 */
describe('list and link', () => {
  let workspace: string;
  let target: string;

  const cli = (args: string[], allowFail = false) => runCli(args, { cwd: workspace, allowFail });
  const linksFile = () => path.join(workspace, '.conducks', 'links.json');

  beforeAll(() => {
    ensureBuild();
    workspace = mkGitRepo('list-workspace');
    target = mkGitRepo('list-target');
    for (const repo of [workspace, target]) {
      writeFile(repo, 'src/a.ts', 'export function f(): number { return 1; }\n');
      commit(repo, 'init');
      runCli(['analyze', '--yes'], { cwd: repo });
    }
  }, 300000);

  afterAll(() => { rmRepo(workspace); rmRepo(target); });

  it('reports no links before anything is linked', () => {
    expect(cli(['list']).combined).toMatch(/No federated projects linked/i);
  }, 120000);

  it('refuses a path that is not an analyzed project', () => {
    const { status } = cli(['link', '/tmp/definitely-not-a-conducks-project'], true);
    expect(status).not.toBe(0);
  }, 120000);

  it('links a real project once, however many times it is linked', () => {
    cli(['link', target]);
    cli(['link', target]);
    const { links } = JSON.parse(cli(['list', '--json']).stdout);
    expect(links.filter((l: { path: string }) => l.path === target)).toHaveLength(1);
    expect(links[0].status).toBe('ok');
  }, 120000);

  /**
   * The one that mattered: a corrupt list read as an empty one, so the tool reported a clean
   * workspace and exited 0 while the user's links were invisible. Same class as ADR 0111 — an empty
   * result that really means "something went wrong".
   */
  it('fails loudly on a corrupt link list instead of reporting none', () => {
    const good = fs.readFileSync(linksFile(), 'utf-8');
    fs.writeFileSync(linksFile(), '{ this is not json');
    try {
      const { combined, status } = cli(['list'], true);
      expect(status).not.toBe(0);
      expect(combined).not.toMatch(/No federated projects linked/i);
      expect(combined).toMatch(/not valid JSON/i);
    } finally {
      fs.writeFileSync(linksFile(), good);
    }
  }, 120000);

  /** A link is verified when written and never again, so a dead one must be marked when read. */
  it('marks a link whose project no longer resolves', () => {
    const vault = path.join(target, '.conducks');
    const stashed = `${vault}-stashed`;
    fs.renameSync(vault, stashed);
    try {
      const { links } = JSON.parse(cli(['list', '--json']).stdout);
      expect(links[0].status).not.toBe('ok');
      expect(cli(['list']).combined).toMatch(/no longer resolve|never analyzed|no longer exists/i);
    } finally {
      fs.renameSync(stashed, vault);
    }
  }, 120000);
});
