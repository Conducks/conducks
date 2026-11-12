import { describe, it, expect, afterEach } from '@jest/globals';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureBuild } from './helpers.js';

/**
 * State-machine audit P-05-7. `register` read `~/.conducks/projects.json`, appended, and wrote it back
 * with no lock, so two `setup` runs at the same moment (two agents in two projects) each wrote a list
 * holding only their own new entry and one project silently vanished. Run in real PROCESSES, since
 * that is the only place the interleaving exists.
 */
const homes: string[] = [];
afterEach(() => { while (homes.length) fs.rmSync(homes.pop()!, { recursive: true, force: true }); });

const registerMany = (home: string, tag: string, n: number) => new Promise<number>((resolve) => {
  const mod = path.resolve('build/src/lib/domain/federation/project-registry.js');
  const script = `
    const { ProjectRegistry } = await import(${JSON.stringify(mod)});
    const r = new ProjectRegistry(${JSON.stringify(home)});
    for (let i = 0; i < ${n}; i++) r.register('/proj/${tag}-' + i);
  `;
  const p = spawn('node', ['--input-type=module', '-e', script], { stdio: 'inherit' });
  p.on('exit', code => resolve(code ?? 1));
});

describe('the project registry under concurrent setup runs', () => {
  it('keeps every project two processes register at the same time', async () => {
    ensureBuild();
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-registry-race-'));
    homes.push(home);
    const codes = await Promise.all([registerMany(home, 'a', 60), registerMany(home, 'b', 60), registerMany(home, 'c', 60)]);
    expect(codes).toEqual([0, 0, 0]);
    const roots = JSON.parse(fs.readFileSync(path.join(home, '.conducks', 'projects.json'), 'utf8')).projects.map((p: any) => p.root);
    expect(new Set(roots).size).toBe(180);
  }, 120000);
});
