import { describe, it, expect, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fsExtra from 'fs-extra';
import { ConducksInstaller } from '@/lib/domain/federation/conducks-installer.js';

/**
 * State-machine audit P-05-12. The skill templates are read from the package's own
 * `resources/skills/`. When that directory was missing or unreadable — a broken or partial install —
 * the read returned NO templates, and "no templates" is indistinguishable from "nothing to do": `setup`
 * reported empty created/updated lists with no error, and `uninstall` removed nothing. A package that
 * has lost its own skills is broken, and says so.
 */
const homes: string[] = [];
afterEach(() => { while (homes.length) rmSync(homes.pop()!, { recursive: true, force: true }); });

describe('the installer refuses to work without its own skills', () => {
  it('sync and remove fail naming the missing directory', async () => {
    const home = mkdtempSync(path.join(tmpdir(), 'conducks-skills-missing-'));
    homes.push(home);
    const broken = new Proxy(fsExtra, {
      get(target, prop) {
        if (prop === 'readdirSync') return (dir: string) => {
          if (dir.endsWith(path.join('resources', 'skills'))) throw Object.assign(new Error(`ENOENT: ${dir}`), { code: 'ENOENT' });
          return (target as any).readdirSync(dir);
        };
        return (target as any)[prop];
      },
    }) as typeof fsExtra;
    const inst = new ConducksInstaller(home, broken, home);

    await expect(inst.sync()).rejects.toThrow(/resources\/skills/);
    await expect(inst.remove(['global'])).rejects.toThrow(/resources\/skills/);
  });
});
