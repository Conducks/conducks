import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fsExtra from 'fs-extra';
import { createRequire } from 'node:module';
import { ConducksInstaller } from '@/lib/domain/federation/conducks-installer.js';

const { load } = createRequire(import.meta.url)('js-yaml') as { load: (s: string) => unknown };

/**
 * An installed SKILL.md opens with a YAML header. Claude Code tolerates a loose one, but strict
 * parsers (the Claude API skill upload, js-yaml, PyYAML) reject an unquoted description holding
 * ": ". Every header the installer writes must therefore parse, and give back the exact text.
 */
describe('conducks-installer — skill header is valid YAML', () => {
  let home = '';
  const skillsSrc = path.resolve(process.cwd(), 'src/resources/skills');

  const installerFor = (fs: typeof fsExtra) => {
    const inst = new ConducksInstaller(home, fs);
    (inst as unknown as { dirs: Record<string, string> }).dirs = {
      global: path.join(home, '.claude', 'skills'),
      local: path.join(home, 'local'),
    };
    return inst;
  };

  const headerOf = (skillFile: string) => {
    const parts = readFileSync(skillFile, 'utf-8').split(/^---$/m);
    return load(parts[1]) as { name: string; description: string };
  };

  beforeEach(() => { home = mkdtempSync(path.join(tmpdir(), 'conducks-hdr-')); });
  afterEach(() => { rmSync(home, { recursive: true, force: true }); });

  it('parses for every shipped skill, with the name and the exact description', async () => {
    await installerFor(fsExtra).sync();
    const names = readdirSync(skillsSrc).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''));
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const comment = readFileSync(path.join(skillsSrc, `${name}.md`), 'utf-8').match(/<!--\s*description:\s*(.+?)\s*-->/)![1];
      const header = headerOf(path.join(home, '.claude', 'skills', name, 'SKILL.md'));
      expect(header.name).toBe(name);
      expect(header.description).toBe(comment);
    }
  });

  it('round-trips a description holding ": ", "#", a double quote and a leading "-"', async () => {
    const tricky = '- Use when: a "quoted" word # and a hash';
    const fake = {
      ...fsExtra,
      readdirSync: (p: string, ...a: unknown[]) =>
        p === skillsSrc ? ['tricky.md'] : (fsExtra.readdirSync as (...x: unknown[]) => unknown)(p, ...a),
      readFileSync: (p: string, ...a: unknown[]) =>
        p === path.join(skillsSrc, 'tricky.md') ? `<!-- description: ${tricky} -->\n\nbody` : (fsExtra.readFileSync as (...x: unknown[]) => unknown)(p, ...a),
    } as unknown as typeof fsExtra;
    await installerFor(fake).sync();
    const header = headerOf(path.join(home, '.claude', 'skills', 'tricky', 'SKILL.md'));
    expect(header).toEqual({ name: 'tricky', description: tricky });
  });
});
