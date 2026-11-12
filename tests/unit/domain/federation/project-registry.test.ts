import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { ProjectRegistry } from '@/lib/domain/federation/project-registry.js';

/**
 * `~/.conducks/projects.json` is what lets one monitor answer "which of my repos has fallen behind"
 * (todo17 Phase 2, ADR 0030).
 *
 * Two properties carry it: `setup` runs repeatedly, so registration must be idempotent; and nothing
 * else in conducks depends on this file, so a missing or corrupt one must read as "no projects"
 * rather than fail the command that touched it.
 */
describe('ProjectRegistry', () => {
  let home = '';
  let registry: ProjectRegistry;

  beforeEach(() => {
    home = mkdtempSync(path.join(tmpdir(), 'conducks-home-'));
    registry = new ProjectRegistry(home);
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  it('reports no projects before anything is registered', () => {
    expect(registry.list()).toEqual([]);
  });

  it('registers a root and names it after its directory', () => {
    const result = registry.register('/repo/my-app');

    expect(result).toEqual({ added: true, total: 1, written: true });
    expect(registry.list()[0]).toMatchObject({ root: '/repo/my-app', name: 'my-app' });
  });

  it('is idempotent — a second setup refreshes the timestamp instead of adding a duplicate', () => {
    registry.register('/repo/my-app');
    const first = registry.list()[0].lastSetupAt;

    const second = registry.register('/repo/my-app');

    expect(second).toEqual({ added: false, total: 1, written: true });
    expect(registry.list()).toHaveLength(1);
    expect(registry.list()[0].registeredAt).toBe(first);
    expect(registry.list()[0].lastSetupAt).toBeGreaterThanOrEqual(first);
  });

  it('treats an unnormalised path as the same project', () => {
    registry.register('/repo/my-app');
    registry.register('/repo/./my-app/');

    expect(registry.list()).toHaveLength(1);
  });

  it('keeps several distinct projects', () => {
    registry.register('/repo/a');
    registry.register('/repo/b');

    expect(registry.list().map(p => p.name).sort()).toEqual(['a', 'b']);
  });

  it('reads a corrupt file as no projects instead of throwing', () => {
    mkdirSync(path.join(home, '.conducks'), { recursive: true });
    writeFileSync(path.join(home, '.conducks', 'projects.json'), '{ not json');

    expect(registry.list()).toEqual([]);
  });

  it('drops entries with no usable root rather than returning them', () => {
    mkdirSync(path.join(home, '.conducks'), { recursive: true });
    writeFileSync(
      path.join(home, '.conducks', 'projects.json'),
      JSON.stringify({ version: 1, projects: [{ name: 'ghost' }, { root: '/repo/real', name: 'real' }] })
    );

    expect(registry.list().map(p => p.name)).toEqual(['real']);
  });

  it('forgets a root, and reports when there was nothing to forget', () => {
    registry.register('/repo/a');

    expect(registry.forget('/repo/a')).toBe(true);
    expect(registry.list()).toEqual([]);
    expect(registry.forget('/repo/a')).toBe(false);
  });

  it('reports roots that no longer exist on disk without removing them', () => {
    registry.register('/definitely/not/a/real/path');
    registry.register(home);                                  // this one exists

    expect(registry.missingRoots().map(p => p.root)).toEqual(['/definitely/not/a/real/path']);
    // Reported, NOT removed: a missing root is usually an unmounted volume, not a dead project.
    expect(registry.list()).toHaveLength(2);
  });

  it('writes a versioned, human-editable file', () => {
    registry.register('/repo/a');
    const raw = readFileSync(path.join(home, '.conducks', 'projects.json'), 'utf8');

    expect(JSON.parse(raw).version).toBe(1);
    expect(raw).toContain('\n  ');          // pretty-printed, because a human may open it
  });

  it('defaults to the real ~/.conducks/projects.json', () => {
    expect(new ProjectRegistry().path).toBe(path.join(homedir(), '.conducks', 'projects.json'));
  });

  it('says so when the registry could not be written, instead of reporting it registered', () => {
    // State-machine audit P-05-8: the write swallowed its error (deliberately — setup must not fail
    // over it) and `register` still answered `added: true`, so setup printed "registered".
    writeFileSync(path.join(home, '.conducks'), 'a FILE where the directory should be');

    expect(registry.register('/repo/a')).toEqual({ added: true, total: 1, written: false });
  });

  it('backs up a malformed registry before replacing it', () => {
    // P-05-9: a hand-edit with a syntax error read as "no projects", and the next register wrote
    // over it — the user's list gone with no copy.
    mkdirSync(path.join(home, '.conducks'), { recursive: true });
    const file = path.join(home, '.conducks', 'projects.json');
    writeFileSync(file, '{ "version": 1, "projects": [ { "root": "/repo/kept" }, ] }');

    registry.register('/repo/new');

    expect(readFileSync(`${file}.bak`, 'utf8')).toBe('{ "version": 1, "projects": [ { "root": "/repo/kept" }, ] }');
    expect(registry.list().map(p => p.root)).toEqual(['/repo/new']);
  });
});
