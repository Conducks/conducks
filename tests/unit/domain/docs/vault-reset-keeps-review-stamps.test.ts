import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Clearing a vault must not delete the one file in it that is COMMITTED.
 *
 * `.conducks/` is ignored except for `note-reviews.json` (`.gitignore:51`), which records which
 * module-note claims a person has read and against which hash of the cited code. Three oracles
 * cleared the vault with `rmSync('<project>/.conducks', { recursive: true })`, and two of them run
 * against conducks itself — so every `npm run oracle` deleted that file, and the next `git add -A`
 * committed the deletion.
 *
 * It happened at least twice before this test existed: commit 86ebe8c, and again inside the todo31
 * commit. Neither was noticed, because the reader treats a missing file as "never stamped" — so
 * `visuals-lint` printed `✓ clean` with its stamp check silently doing nothing, and 38 stale claims
 * went unreported for days. An absent warning reads exactly like a passing one, which is the failure
 * ADR 0044 names and the reason this is a test rather than a comment.
 */
let dir = '';

const vault = (files: Record<string, string>) => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-vault-')));
  fs.mkdirSync(path.join(dir, '.conducks'), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    const full = path.join(dir, '.conducks', name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  return dir;
};

const load = async () => {
  const mod = await import(pathToFileURL(path.resolve('tools/benchmark/reset-vault.mjs')).href);
  return mod.resetVault as (projectDir: string) => void;
};

afterEach(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = '';
});

describe('resetting a vault', () => {
  it('deletes the database so the next analyze is cold', () => {
    // The thing the oracles actually need. Keeping the DB would make every "cold" measurement a
    // measurement of a warm one, which is a worse failure than the one this file guards.
    const root = vault({ 'conducks-synapse.db': 'x', 'mcp.log': 'y', 'note-reviews.json': '{}' });

    return load().then(resetVault => {
      resetVault(root);
      expect(fs.existsSync(path.join(root, '.conducks', 'conducks-synapse.db'))).toBe(false);
      expect(fs.existsSync(path.join(root, '.conducks', 'mcp.log'))).toBe(false);
    });
  });

  it('KEEPS note-reviews.json, byte for byte', async () => {
    const stamps = JSON.stringify({ 'docs/visuals/modules/core/graph.md': { 'src/x.ts': 'abc123' } }, null, 2);
    const root = vault({ 'conducks-synapse.db': 'x', 'note-reviews.json': stamps });

    (await load())(root);

    const kept = path.join(root, '.conducks', 'note-reviews.json');
    expect(fs.existsSync(kept)).toBe(true);
    expect(fs.readFileSync(kept, 'utf8')).toBe(stamps);
  });

  it('leaves the directory itself in place', async () => {
    // Removing the directory is what deleted the committed file twice. Even with nothing to keep,
    // the folder stays, so a carve-out added later cannot be destroyed by a stale assumption here.
    const root = vault({ 'conducks-synapse.db': 'x' });

    (await load())(root);

    expect(fs.existsSync(path.join(root, '.conducks'))).toBe(true);
  });

  it('does nothing, and throws nothing, when there is no vault at all', async () => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-vault-')));

    await expect(load().then(reset => reset(dir))).resolves.not.toThrow();
    expect(fs.existsSync(path.join(dir, '.conducks'))).toBe(false);
  });
});

describe('the oracles use it — the half a unit test cannot see', () => {
  it('no oracle still removes the whole .conducks directory', () => {
    // The unit above proves the helper is right. This proves the CALLERS were changed, which is the
    // part that actually stopped the file from being deleted. A correct helper nobody calls is the
    // shape of every dead subsystem this project has found.
    const offenders = ['oracle-tsc.mjs', 'oracle-exports.mjs', 'oracle-python.mjs']
      .map(f => [f, fs.readFileSync(path.resolve('tools/benchmark', f), 'utf8')] as const)
      .filter(([, src]) => /rmSync\([^)]*['"`]\.conducks['"`]/.test(src) || /rmSync\(path\.join\(projectDir, '\.conducks'\)/.test(src))
      .map(([f]) => f);

    expect(offenders).toEqual([]);
  });

  it('and each of them calls resetVault instead', () => {
    const missing = ['oracle-tsc.mjs', 'oracle-exports.mjs', 'oracle-python.mjs']
      .filter(f => !fs.readFileSync(path.resolve('tools/benchmark', f), 'utf8').includes('resetVault(projectDir)'));

    expect(missing).toEqual([]);
  });
});
