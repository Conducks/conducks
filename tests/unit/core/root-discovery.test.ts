import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RegistryBootstrapper } from '@/lib/core/registry-bootstrapper.js';
import { isNeverAProjectRoot } from '@/lib/core/utils/scope-guard.js';

/**
 * Root discovery must not anchor a vault outside a project (ADR 0039).
 *
 * `discoverRoot()` walks up until it finds a marker, and it checks `.conducks` FIRST — a vault
 * proves someone analyzed here. That rule is self-reinforcing in the worst way: one stray vault in
 * a system temp directory makes every folder beneath it resolve to that directory forever.
 *
 * Measured 2026-07-29. Two benchmark projects with no `package.json` of their own both anchored at
 * `/private/tmp`, where a vault had been left on 2026-07-26, and analyzed 2,323 unrelated files
 * instead of their own source — reporting an out-of-memory failure that had nothing to do with
 * either project. The third had a `package.json` and was the only one that worked, which is why it
 * read as an unexplained "2 of 3 fail" rather than as a boundary bug.
 *
 * The fix reuses the scope guard's own predicate rather than adding a second list, which is ADR
 * 0039's rule: one notion of what a project is, however many subsystems ask.
 */

const roots: string[] = [];
const mkRoot = (): string => {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-root-'));
  roots.push(r);
  return r;
};
afterEach(() => { for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true }); });

describe('isNeverAProjectRoot — one notion of "not a project"', () => {
  it('rejects the system and home directories a vault must never be written to', () => {
    expect(isNeverAProjectRoot('/private/tmp')).toBe(true);
    expect(isNeverAProjectRoot('/tmp')).toBe(true);
    expect(isNeverAProjectRoot(os.homedir())).toBe(true);
    expect(isNeverAProjectRoot(path.join(os.homedir(), 'Documents'))).toBe(true);
  });

  it('rejects tooling directory names wherever they appear', () => {
    expect(isNeverAProjectRoot('/anywhere/at/all/node_modules')).toBe(true);
    expect(isNeverAProjectRoot('/anywhere/at/all/vendor')).toBe(true);
    expect(isNeverAProjectRoot('/anywhere/at/all/coverage')).toBe(true);
  });

  it('accepts an ordinary directory, so the guard does not refuse real projects', () => {
    expect(isNeverAProjectRoot(mkRoot())).toBe(false);
  });
});

describe('discoverRoot — a DECLARED workspace outranks an inferred marker (ADR 0069)', () => {

  /**
   * Measured on `mentorseed`, which declares five services in a root `conducks.json`. Analyzing
   * `app` anchored at `app` because it carries its own package.json; analyzing `database` — a
   * declared service with NO package.json — walked past the workspace and planted a second vault at
   * the repository root holding 40 nodes. One repository, several partial vaults, and the smallest
   * one sitting where a reader would most trust it.
   */
  it('anchors at the declared workspace, not at a nearer package marker', () => {
    const ws = mkRoot();
    fs.writeFileSync(path.join(ws, 'conducks.json'), JSON.stringify({ services: ['app'] }));
    const service = path.join(ws, 'app');
    fs.mkdirSync(service, { recursive: true });
    // The nearer, inferred marker — this is what used to win.
    fs.writeFileSync(path.join(service, 'package.json'), '{}');

    expect(new RegistryBootstrapper().discoverRoot(service)).toBe(ws);
  });

  it('anchors at the declared workspace for a service that has NO marker of its own', () => {
    // `database` in mentorseed: a real declared service with no package.json. This is the case that
    // produced the 40-node root vault.
    const ws = mkRoot();
    fs.writeFileSync(path.join(ws, 'conducks.json'), JSON.stringify({ services: ['database'] }));
    const service = path.join(ws, 'database');
    fs.mkdirSync(service, { recursive: true });

    expect(new RegistryBootstrapper().discoverRoot(service)).toBe(ws);
  });

  it('outranks a stray vault, so a split tree heals instead of staying split', () => {
    // The declaration must beat `.conducks` too — otherwise a tree that already grew per-service
    // vaults keeps answering from them forever.
    const ws = mkRoot();
    fs.writeFileSync(path.join(ws, 'conducks.json'), JSON.stringify({ services: ['app'] }));
    const service = path.join(ws, 'app');
    fs.mkdirSync(path.join(service, '.conducks'), { recursive: true });

    expect(new RegistryBootstrapper().discoverRoot(service)).toBe(ws);
  });

  it('leaves a project with NO declaration exactly as it was — this change is additive', () => {
    // Every project conducks has ever run against, including its own, is this case.
    const repo = mkRoot();
    fs.writeFileSync(path.join(repo, 'package.json'), '{}');
    const nested = path.join(repo, 'src', 'deep');
    fs.mkdirSync(nested, { recursive: true });

    expect(new RegistryBootstrapper().discoverRoot(nested)).toBe(repo);
  });
});

describe('discoverRoot — a stray vault must not recruit the tree above it', () => {
  /**
   * The exact shape of the measured failure, reproduced with a name the guard rejects everywhere
   * (the real case was `/private/tmp`, which cannot be created in a test). A `.conducks` inside it
   * used to win outright because the vault check ran before anything else.
   */
  it('walks past a directory that is never a project, even when it holds a vault', () => {
    const base = mkRoot();
    const parked = path.join(base, 'vendor');
    const project = path.join(parked, 'app');
    fs.mkdirSync(path.join(parked, '.conducks'), { recursive: true });
    fs.mkdirSync(project, { recursive: true });

    const found = new RegistryBootstrapper().discoverRoot(project);
    expect(found).not.toBe(parked);
  });

  /**
   * The rule it must not have broken. A real project that has been analyzed but carries no
   * `package.json` still has to be found by its `.conducks` — that is why the vault is checked
   * first, and the fix narrows the rule rather than removing it.
   */
  it('still finds a real project by its vault alone', () => {
    const base = mkRoot();
    const project = path.join(base, 'my-service');
    fs.mkdirSync(path.join(project, '.conducks'), { recursive: true });
    const deep = path.join(project, 'src', 'inner');
    fs.mkdirSync(deep, { recursive: true });

    expect(new RegistryBootstrapper().discoverRoot(deep)).toBe(project);
  });

  it('still prefers the nearest project marker', () => {
    const base = mkRoot();
    const project = path.join(base, 'svc');
    fs.mkdirSync(project, { recursive: true });
    fs.writeFileSync(path.join(project, 'package.json'), '{}');

    expect(new RegistryBootstrapper().discoverRoot(project)).toBe(project);
  });
});
