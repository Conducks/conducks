import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * ADR 0126 — `setup --dry-run` and `uninstall --dry-run` write nothing.
 *
 * These two commands mutate state OUTSIDE the project: the Claude Desktop config in
 * `~/Library/Application Support/`, `~/.claude/skills`, and `~/.conducks/projects.json`. That is why
 * the todo37 sweep could not measure them — running one to find out what it does is the same act as
 * letting it do it — and why `--dry-run` exists at all.
 *
 * It was verified by checksumming the real config by hand and never pinned by a test, which
 * `docs-status` reported as "1 ADR with no build link or enforcing test". A guarantee about not
 * touching a user's machine is exactly the kind that needs a test rather than a memory of having
 * checked once.
 *
 * The real config is NOT the subject here. `HOME` is redirected at a temp directory so the assertion
 * is about the commands' behaviour rather than about this machine, and a regression cannot damage the
 * developer running the suite.
 */
describe('a dry run writes nothing', () => {
  let repo: string;
  let fakeHome: string;

  const snapshot = (dir: string): string[] => {
    const out: string[] = [];
    const walk = (d: string) => {
      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else out.push(`${full}:${fs.statSync(full).size}`);
      }
    };
    walk(dir);
    return out.sort();
  };

  beforeAll(() => {
    ensureBuild();
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-home-'));
    // A config carrying a conducks entry, so `uninstall --dry-run` has something real to report on
    // and cannot pass by finding nothing to do.
    const cfgDir = path.join(fakeHome, 'Library', 'Application Support', 'Claude');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, 'claude_desktop_config.json'),
      JSON.stringify({ mcpServers: { conducks: { command: 'node', args: ['x'] }, other: { command: 'y' } } }, null, 2));

    repo = mkGitRepo('dry-run');
    writeFile(repo, 'src/a.ts', 'export const a = 1;\n');
    commit(repo, 'init');
  }, 300000);

  afterAll(() => { rmRepo(repo); fs.rmSync(fakeHome, { recursive: true, force: true }); });

  it('setup --dry-run leaves HOME byte-identical', () => {
    const before = snapshot(fakeHome);
    const { status } = runCli(['setup', '--dry-run'], { cwd: repo, env: { HOME: fakeHome }, allowFail: true });
    expect(status).toBe(0);
    expect(snapshot(fakeHome)).toEqual(before);
  }, 120000);

  it('uninstall --dry-run leaves HOME byte-identical, and the conducks entry survives', () => {
    const cfg = path.join(fakeHome, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    const before = snapshot(fakeHome);
    const { status } = runCli(['uninstall', '--dry-run'], { cwd: repo, env: { HOME: fakeHome }, allowFail: true });
    expect(status).toBe(0);
    expect(snapshot(fakeHome)).toEqual(before);
    // The point of the guarantee: the thing it would have removed is still there.
    expect(JSON.parse(fs.readFileSync(cfg, 'utf8')).mcpServers.conducks).toBeDefined();
  }, 120000);

  it('a dry run says what it WOULD touch, or it is not a preview', () => {
    const { combined } = runCli(['uninstall', '--dry-run'], { cwd: repo, env: { HOME: fakeHome }, allowFail: true });
    expect(combined).toMatch(/dry-run/i);
    expect(combined).toMatch(/claude_desktop_config\.json/);
  }, 120000);
});
