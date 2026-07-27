import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

// System domain. STALE NAME: the todo names `conducks_system` — no MCP tool by that name exists
// (grep confirms it), and MCP is read-only by design (CONDUCKS-8) so an installer could never be
// an MCP tool anyway. The real capability the todo meant ("Installer + MCP") is `conducks setup`:
// ConducksInstaller (skills sync) + ProjectRegistry (project registration) + MCPConfigurator
// (Claude Desktop config registration). All three resolve their target paths through
// os.homedir()/HOME (conducks-installer.ts:77, project-registry.ts:41, mcp-configurator.ts:22), so
// this suite sandboxes them with a fake HOME rather than touching the real machine's
// ~/.claude/skills or Claude Desktop config — that isolation is real code behavior (HOME
// resolution), not a mock of the installer itself.
describe('System domain integration (conducks setup)', () => {
  let repo: string;
  let fakeHome: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('system');
    writeFile(repo, 'src/index.ts', `export const x = 1;`);
    commit(repo, 'init');
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-int-system-home-'));
  });

  afterAll(() => {
    rmRepo(repo);
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  it('installs skills into the sandboxed HOME and registers the project, without touching the real HOME', () => {
    const realSkillsDir = path.join(os.homedir(), '.claude', 'skills', 'conducks-guide');
    const realSkillsExistedBefore = fs.existsSync(realSkillsDir);

    const { combined, status } = runCli(['setup'], { cwd: repo, env: { HOME: fakeHome } });
    expect(status).toBe(0);
    expect(combined).toContain('Setup complete');

    const fakeSkillsDir = path.join(fakeHome, '.claude', 'skills');
    expect(fs.existsSync(fakeSkillsDir)).toBe(true);
    expect(fs.readdirSync(fakeSkillsDir).length).toBeGreaterThan(0);

    const projectsFile = path.join(fakeHome, '.conducks', 'projects.json');
    expect(fs.existsSync(projectsFile)).toBe(true);
    const registry = JSON.parse(fs.readFileSync(projectsFile, 'utf-8'));
    expect(registry.projects.some((p: any) => p.root === fs.realpathSync(repo))).toBe(true);

    // The real machine HOME must be completely unaffected — this is the assertion that would
    // fail if HOME sandboxing were broken (e.g. a hardcoded path snuck into the installer).
    expect(fs.existsSync(realSkillsDir)).toBe(realSkillsExistedBefore);
  });

  it('registers Conducks in the sandboxed Claude Desktop config with a working CLI entry', () => {
    const configPath = path.join(fakeHome, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    expect(fs.existsSync(configPath)).toBe(true);
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(config.mcpServers.conducks.args).toContain('mcp');
    expect(fs.existsSync(config.mcpServers.conducks.args[0])).toBe(true);
  });

  // Assertion can fail: a second run must recognize existing state instead of re-adding it.
  it('a second setup run is idempotent — reports "already registered", not a duplicate', () => {
    const { combined } = runCli(['setup'], { cwd: repo, env: { HOME: fakeHome } });
    expect(combined).toContain('already registered');

    const projectsFile = path.join(fakeHome, '.conducks', 'projects.json');
    const registry = JSON.parse(fs.readFileSync(projectsFile, 'utf-8'));
    const count = registry.projects.filter((p: any) => p.root === fs.realpathSync(repo)).length;
    expect(count).toBe(1);
  });
});
