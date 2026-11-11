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
 *  - the global copy is refreshed in place, never deleted and recreated (a stale skill
 *    that still loads is worse than none) — this file is one of the two gates for
 *    "skills name only live tools, and only one copy is editable"
 *    (the other is tests/unit/interfaces/tools/skills-tool-surface.test.ts)
 */
describe('conducks-installer — global is the only scope', () => {
  let project = '';
  let home = '';
  let fs: typeof fsExtra;

  // The real homedir() is not writable in a test, so home is a temp dir — path shape stays
  // identical, nothing touches the real ~.
  const installerFor = (proj: string) => new ConducksInstaller(proj, fs, home);

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
    expect(existsSync(globalSkill('conducks'))).toBe(true);
    expect(existsSync(path.join(project, '.claude', 'skills'))).toBe(false);
  });

  it('leaves the documentation and visuals skills alone: they no longer ship, and are not conducks\'s to delete', async () => {
    for (const old of ['conducks-docs', 'conducks-visuals']) {
      mkdirSync(path.dirname(globalSkill(old)), { recursive: true });
      writeFileSync(globalSkill(old), 'the owner\'s documentation standard');
    }
    const inst = installerFor(project);
    const [report] = await inst.sync();
    expect(report.retired).toEqual([]);
    await inst.remove();
    for (const old of ['conducks-docs', 'conducks-visuals']) {
      expect(readFileSync(globalSkill(old), 'utf-8')).toBe('the owner\'s documentation standard');
    }
    expect(existsSync(globalSkill('conducks'))).toBe(false); // uninstall still removes what conducks ships
  });

  it('still retires a skill that was merged into another', async () => {
    mkdirSync(path.dirname(globalSkill('conducks-guide')), { recursive: true });
    writeFileSync(globalSkill('conducks-guide'), 'from an earlier release');
    const [report] = await installerFor(project).sync();
    expect(report.retired).toEqual(['conducks-guide']);
    expect(existsSync(globalSkill('conducks-guide'))).toBe(false);
  });

  it('points global at the real ~/.claude/skills by default', () => {
    expect(new ConducksInstaller(project, fs).dirFor('global'))
      .toBe(path.join(homedir(), '.claude', 'skills'));
  });

  /**
   * Codex, Gemini CLI and Antigravity read the same SKILL.md format from their own folders
   * (ADR 0198). Each is written only when that agent is on the machine.
   */
  describe('other agents', () => {
    const agents = (name: string) => path.join(home, '.agents', 'skills', name, 'SKILL.md');
    const antigravity = (name: string) => path.join(home, '.gemini', 'config', 'skills', name, 'SKILL.md');

    it('writes nowhere else when no other agent is installed', async () => {
      await installerFor(project).sync();
      expect(existsSync(path.join(home, '.agents'))).toBe(false);
      expect(existsSync(path.join(home, '.gemini'))).toBe(false);
    });

    it('installs into ~/.agents/skills when Codex is present', async () => {
      mkdirSync(path.join(home, '.codex'));
      const reports = await installerFor(project).sync();
      expect(reports.map(r => r.scope)).toEqual(['global', 'agents']);
      expect(readFileSync(agents('conducks'), 'utf-8')).toBe(readFileSync(globalSkill('conducks'), 'utf-8'));
      expect(existsSync(antigravity('conducks'))).toBe(false);
    });

    it('installs into ~/.agents/skills when Gemini CLI is present', async () => {
      mkdirSync(path.join(home, '.gemini'));
      writeFileSync(path.join(home, '.gemini', 'settings.json'), '{}');
      await installerFor(project).sync();
      expect(existsSync(agents('conducks'))).toBe(true);
    });

    it('installs into ~/.gemini/config/skills when Antigravity is present', async () => {
      mkdirSync(path.join(home, '.gemini', 'antigravity'), { recursive: true });
      await installerFor(project).sync();
      expect(existsSync(antigravity('conducks'))).toBe(true);
    });

    it('prunes retired skills there, and leaves the user\'s own skills alone', async () => {
      mkdirSync(path.join(home, '.codex'));
      const retired = agents('conducks-guide');
      const mine = agents('pentest-master');
      for (const f of [retired, mine]) { mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, 'x'); }
      await installerFor(project).sync();
      expect(existsSync(retired)).toBe(false);
      expect(readFileSync(mine, 'utf-8')).toBe('x');
    });

    it('uninstall clears them too', async () => {
      mkdirSync(path.join(home, '.codex'));
      mkdirSync(path.join(home, '.gemini', 'antigravity'), { recursive: true });
      const inst = installerFor(project);
      await inst.sync();
      await inst.remove();
      expect(existsSync(agents('conducks'))).toBe(false);
      expect(existsSync(antigravity('conducks'))).toBe(false);
    });
  });
});
