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
   * Measured on `subject-b`, which declares five services in a root `conducks.json`. Analyzing
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
    // `database` in subject-b: a real declared service with no package.json. This is the case that
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

describe('discoverRoot — a NESTED declaration wins for paths beneath it (ADR 0069 open question)', () => {
  /**
   * ADR 0069 left this open: a vendored dependency that is itself a monorepo can declare its own
   * `conducks.json`. `findDeclaredWorkspace()` takes the NEAREST declaration walking up, so a path
   * under the vendored tree should anchor at the vendored root, not at the outer workspace — and a
   * path outside the vendored tree must still anchor at the outer workspace. This was believed right
   * and untested; this is that test.
   */
  it('anchors a path under the nested declaration at the INNER root, not the outer one', () => {
    const outer = mkRoot();
    fs.writeFileSync(path.join(outer, 'conducks.json'), JSON.stringify({ services: ['app', 'vendor/dep'] }));
    const inner = path.join(outer, 'vendor', 'dep');
    fs.mkdirSync(inner, { recursive: true });
    fs.writeFileSync(path.join(inner, 'conducks.json'), JSON.stringify({ services: ['sub'] }));
    const deep = path.join(inner, 'src', 'file');
    fs.mkdirSync(deep, { recursive: true });

    expect(new RegistryBootstrapper().discoverRoot(deep)).toBe(inner);
  });

  it('anchors a path OUTSIDE the nested declaration at the outer workspace, unaffected by it', () => {
    const outer = mkRoot();
    fs.writeFileSync(path.join(outer, 'conducks.json'), JSON.stringify({ services: ['app', 'vendor/dep'] }));
    const inner = path.join(outer, 'vendor', 'dep');
    fs.mkdirSync(inner, { recursive: true });
    fs.writeFileSync(path.join(inner, 'conducks.json'), JSON.stringify({ services: ['sub'] }));
    const sibling = path.join(outer, 'app', 'src');
    fs.mkdirSync(sibling, { recursive: true });

    expect(new RegistryBootstrapper().discoverRoot(sibling)).toBe(outer);
  });

  it('anchors the nested root itself at the nested declaration, not the outer one', () => {
    // The boundary case: `from` IS the directory carrying the inner conducks.json, not a descendant
    // of it. `findDeclaredWorkspace` checks `current` before walking to the parent, so this must
    // still resolve to `inner`.
    const outer = mkRoot();
    fs.writeFileSync(path.join(outer, 'conducks.json'), JSON.stringify({ services: ['vendor/dep'] }));
    const inner = path.join(outer, 'vendor', 'dep');
    fs.mkdirSync(inner, { recursive: true });
    fs.writeFileSync(path.join(inner, 'conducks.json'), JSON.stringify({ services: ['sub'] }));

    expect(new RegistryBootstrapper().discoverRoot(inner)).toBe(inner);
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
