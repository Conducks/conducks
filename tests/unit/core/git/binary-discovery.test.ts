import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ChronicleInterface } from '@/lib/core/git/chronicle-interface.js';

/**
 * Git discovery had NO extension filter, so every tracked file became a unit — measured on mentorseed,
 * 53 `.png` and `.svg` files were read as UTF-8 and given graph nodes. A binary blob carries no symbol:
 * it is noise in the graph, a wasted read each, and it skews any per-file ratio taken from the unit
 * count (1,041 "units" against 692 real code files).
 *
 * The filter is a DENYLIST rather than the provider-derived allowlist the FS fallback uses, for two
 * reasons pinned below: deriving the allowlist would import all 13 language providers onto the hot
 * path (they are dynamic precisely to stay off it), and a denylist fails safe — an unknown extension
 * is still analyzed, so a language added later is never silently skipped.
 */
describe('git discovery skips binaries', () => {
  let repo = '';
  let files: string[] = [];

  beforeAll(async () => {
    repo = mkdtempSync(path.join(tmpdir(), 'conducks-bin-'));
    mkdirSync(path.join(repo, 'src'), { recursive: true });
    writeFileSync(path.join(repo, 'src', 'a.ts'), 'export const a = 1;\n');
    writeFileSync(path.join(repo, 'README.md'), '# readme\n');
    writeFileSync(path.join(repo, 'package.json'), '{"name":"bin-fixture"}\n');
    // Real binary bytes, not text with a binary name.
    writeFileSync(path.join(repo, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    writeFileSync(path.join(repo, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>\n');
    writeFileSync(path.join(repo, 'font.woff2'), Buffer.from([0x77, 0x4f, 0x46, 0x32]));
    writeFileSync(path.join(repo, 'bundle.wasm'), Buffer.from([0x00, 0x61, 0x73, 0x6d]));
    execSync('git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm init', { cwd: repo, stdio: 'ignore' });

    files = (await new ChronicleInterface(repo).discoverFiles()).map(f => path.basename(f));
  });

  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  it('discovers source, docs and config', () => {
    expect(files).toEqual(expect.arrayContaining(['a.ts', 'README.md', 'package.json']));
  });

  it('skips images, fonts and compiled artefacts', () => {
    for (const skipped of ['logo.png', 'icon.svg', 'font.woff2', 'bundle.wasm']) {
      expect(files).not.toContain(skipped);
    }
  });

  it('is a denylist — an unknown extension is still analyzed rather than silently dropped', async () => {
    writeFileSync(path.join(repo, 'src', 'thing.zig'), 'pub fn main() void {}\n');
    execSync('git add -A && git -c user.email=t@t -c user.name=t commit -qm zig', { cwd: repo, stdio: 'ignore' });

    const again = (await new ChronicleInterface(repo).discoverFiles()).map(f => path.basename(f));

    // No zig provider exists. It must still be discovered: a stale ALLOWLIST would drop a language the
    // moment one is added, and being wrong in that direction is silent.
    expect(again).toContain('thing.zig');
  });
});
