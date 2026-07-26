import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import fsExtra from 'fs-extra';
import { ConducksInstaller } from '@/lib/domain/federation/conducks-installer.js';

/**
 * Conducks is a platform, so the skills belong in ~/.claude/skills — one copy, every project. A repo
 * may still pin its own. The rule that matters: sync NEVER deletes, and any scope already holding an
 * older copy is refreshed whether or not it was asked for (CONDUCKS-15 — a stale skill that still
 * loads is worse than none).
 */
describe('conducks-installer — global and local scopes', () => {
  let project = '';
  let home = '';
  let fs: typeof fsExtra;

  // The real homedir() is not writable in a test, so the global scope is redirected onto a temp dir
  // through the injected filesystem — path shape stays identical, nothing touches the real ~.
  const installerFor = (proj: string) => {
    const inst = new ConducksInstaller(proj, fs);
    (inst as unknown as { dirs: Record<string, string> }).dirs = {
      global: path.join(home, '.claude', 'skills'),
      local: path.join(proj, '.claude', 'skills'),
    };
    return inst;
  };

  beforeEach(() => {
    project = mkdtempSync(path.join(tmpdir(), 'conducks-proj-'));
    home = mkdtempSync(path.join(tmpdir(), 'conducks-home-'));
    fs = fsExtra;
  });
  afterEach(() => {
    rmSync(project, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  it('installs globally by default and reports created vs unchanged', async () => {
    const inst = installerFor(project);
    const first = await inst.sync(['global']);
    expect(first).toHaveLength(1);
    expect(first[0].scope).toBe('global');
    expect(first[0].created.length).toBeGreaterThan(0);
    expect(first[0].updated).toEqual([]);
    expect(existsSync(path.join(home, '.claude', 'skills', 'conducks-docs', 'SKILL.md'))).toBe(true);
    // Nothing was written into the project.
    expect(existsSync(path.join(project, '.claude', 'skills'))).toBe(false);

    // Re-running claims no work it did not do.
    const second = await inst.sync(['global']);
    expect(second[0].created).toEqual([]);
    expect(second[0].updated).toEqual([]);
    expect(second[0].unchanged.length).toBeGreaterThan(0);
  });

  it('installs locally when asked, and to both when both are asked', async () => {
    const inst = installerFor(project);
    const local = await inst.sync(['local']);
    expect(local.map(r => r.scope)).toEqual(['local']);
    expect(existsSync(path.join(project, '.claude', 'skills', 'conducks-docs', 'SKILL.md'))).toBe(true);

    const both = await installerFor(project).sync(['global', 'local']);
    expect(both.map(r => r.scope).sort()).toEqual(['global', 'local']);
  });

  it('refreshes a stale copy in a scope nobody asked for, in place, without deleting', async () => {
    const inst = installerFor(project);
    const stale = path.join(project, '.claude', 'skills', 'conducks-docs', 'SKILL.md');
    mkdirSync(path.dirname(stale), { recursive: true });
    writeFileSync(stale, 'an old version from a previous conducks release');
    // A file the installer does not own, in the same tree — it must survive untouched.
    const foreign = path.join(project, '.claude', 'skills', 'my-own-skill', 'SKILL.md');
    mkdirSync(path.dirname(foreign), { recursive: true });
    writeFileSync(foreign, 'mine');

    const reports = await inst.sync(['global']);            // local NOT requested
    const localReport = reports.find(r => r.scope === 'local')!;
    expect(localReport).toBeDefined();                       // …but refreshed anyway
    expect(localReport.updated).toContain('conducks-docs');  // updated in place, not recreated
    expect(readFileSync(stale, 'utf-8')).toContain('name: conducks-docs');
    expect(readFileSync(foreign, 'utf-8')).toBe('mine');
  });

  it('uninstall clears every scope that has them and leaves foreign skills alone', async () => {
    const inst = installerFor(project);
    await inst.sync(['global', 'local']);
    const foreign = path.join(project, '.claude', 'skills', 'my-own-skill', 'SKILL.md');
    mkdirSync(path.dirname(foreign), { recursive: true });
    writeFileSync(foreign, 'mine');

    const reports = await inst.remove();
    expect(reports.map(r => r.scope).sort()).toEqual(['global', 'local']);
    for (const r of reports) expect(r.removed.length).toBeGreaterThan(0);
    expect(existsSync(path.join(home, '.claude', 'skills', 'conducks-docs'))).toBe(false);
    expect(existsSync(foreign)).toBe(true);
  });

  it('points global at the real ~/.claude/skills by default', () => {
    expect(new ConducksInstaller(project, fs).dirFor('global'))
      .toBe(path.join(homedir(), '.claude', 'skills'));
  });
});
