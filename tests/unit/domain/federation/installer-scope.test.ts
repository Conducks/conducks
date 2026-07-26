import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import fsExtra from 'fs-extra';
import { ConducksInstaller } from '@/lib/domain/federation/conducks-installer.js';

/**
 * Conducks is a platform, so the skills have ONE home: `~/.claude/skills` (ADR 0029). A repo-local
 * copy is not a pin — Claude Code discovers both directories, so a project holding both loads every
 * skill twice. The rules that matter:
 *
 *  - sync installs globally and PRUNES a local copy, because a duplicate is a defect
 *  - it never touches a skill conducks does not own, in either scope
 *  - the global copy is refreshed in place, never deleted and recreated (CONDUCKS-15 — a stale skill
 *    that still loads is worse than none)
 */
describe('conducks-installer — global is the only scope', () => {
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

  const globalSkill = (name: string) => path.join(home, '.claude', 'skills', name, 'SKILL.md');
  const localSkill = (name: string) => path.join(project, '.claude', 'skills', name, 'SKILL.md');

  beforeEach(() => {
    project = mkdtempSync(path.join(tmpdir(), 'conducks-proj-'));
    home = mkdtempSync(path.join(tmpdir(), 'conducks-home-'));
    fs = fsExtra;
  });
  afterEach(() => {
    rmSync(project, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  it('installs globally and writes nothing into the project', async () => {
    const reports = await installerFor(project).sync();

    expect(reports).toHaveLength(1);
    expect(reports[0].scope).toBe('global');
    expect(reports[0].created.length).toBeGreaterThan(0);
    expect(reports[0].updated).toEqual([]);
    expect(existsSync(globalSkill('conducks-docs'))).toBe(true);
    expect(existsSync(path.join(project, '.claude', 'skills'))).toBe(false);
  });

  it('claims no work it did not do on a second run', async () => {
    const inst = installerFor(project);
    await inst.sync();
    const second = await inst.sync();

    expect(second[0].created).toEqual([]);
    expect(second[0].updated).toEqual([]);
    expect(second[0].unchanged.length).toBeGreaterThan(0);
  });

  it('prunes a repo-local copy, because it would load twice against the global one', async () => {
    const stale = localSkill('conducks-docs');
    mkdirSync(path.dirname(stale), { recursive: true });
    writeFileSync(stale, 'an old version from a previous conducks release');

    const reports = await installerFor(project).sync();
    const local = reports.find(r => r.scope === 'local');

    expect(local).toBeDefined();
    expect(local!.superseded).toContain('conducks-docs');
    expect(existsSync(stale)).toBe(false);
    // The global copy is the one that survives, and it is current.
    expect(readFileSync(globalSkill('conducks-docs'), 'utf-8')).toContain('name: conducks-docs');
  });

  it('leaves a skill conducks does not own alone in the local directory it prunes', async () => {
    const mine = localSkill('my-own-skill');
    mkdirSync(path.dirname(mine), { recursive: true });
    writeFileSync(mine, 'mine');
    const stale = localSkill('conducks-docs');
    mkdirSync(path.dirname(stale), { recursive: true });
    writeFileSync(stale, 'old');

    await installerFor(project).sync();

    expect(existsSync(stale)).toBe(false);
    expect(readFileSync(mine, 'utf-8')).toBe('mine');
    // Pruning is per-skill, so the shared directory itself must survive.
    expect(existsSync(path.join(project, '.claude', 'skills'))).toBe(true);
  });

  it('reports no local scope at all when there is nothing to prune', async () => {
    const reports = await installerFor(project).sync();
    expect(reports.map(r => r.scope)).toEqual(['global']);
  });

  it('refreshes the global copy in place rather than deleting it', async () => {
    const inst = installerFor(project);
    await inst.sync();
    writeFileSync(globalSkill('conducks-docs'), 'hand-edited, and out of date');

    const reports = await inst.sync();

    expect(reports[0].updated).toContain('conducks-docs');
    expect(reports[0].created).not.toContain('conducks-docs');
    expect(readFileSync(globalSkill('conducks-docs'), 'utf-8')).toContain('name: conducks-docs');
  });

  it('uninstall clears every scope that has them and leaves foreign skills alone', async () => {
    const inst = installerFor(project);
    await inst.sync();
    // A local copy predating the global-only rule is exactly what uninstall must still reach.
    mkdirSync(path.dirname(localSkill('conducks-docs')), { recursive: true });
    writeFileSync(localSkill('conducks-docs'), 'old local copy');
    const foreign = localSkill('my-own-skill');
    mkdirSync(path.dirname(foreign), { recursive: true });
    writeFileSync(foreign, 'mine');

    const reports = await inst.remove();

    expect(reports.map(r => r.scope).sort()).toEqual(['global', 'local']);
    expect(existsSync(path.join(home, '.claude', 'skills', 'conducks-docs'))).toBe(false);
    expect(existsSync(path.join(project, '.claude', 'skills', 'conducks-docs'))).toBe(false);
    expect(existsSync(foreign)).toBe(true);
  });

  it('points global at the real ~/.claude/skills by default', () => {
    expect(new ConducksInstaller(project, fs).dirFor('global'))
      .toBe(path.join(homedir(), '.claude', 'skills'));
  });
});
