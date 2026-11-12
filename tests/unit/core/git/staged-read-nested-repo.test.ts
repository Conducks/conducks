import { describe, it, expect, afterEach } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ChronicleInterface } from '@/lib/core/git/index.js';

/**
 * `analyze --staged` reads each file from the git INDEX, and the index belongs to the repository
 * that owns the file. In a workspace whose anchor holds no `.git` and whose service is its own
 * repository, `git show :0:<path>` ran in the ANCHOR directory, failed, and the staged change was
 * dropped with nothing but a warning (state-machine audit P-05-1).
 */
const tmp: string[] = [];
afterEach(() => { while (tmp.length) fs.rmSync(tmp.pop()!, { recursive: true, force: true }); });

describe('a staged read in a nested repository', () => {
  it('reads the STAGED content from the repository that owns the file', async () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-staged-ws-'));
    tmp.push(ws);
    const svc = path.join(ws, 'svc');
    fs.mkdirSync(svc);
    const git = (...a: string[]) => execFileSync('git', a, { cwd: svc, stdio: 'ignore' });
    git('init', '-q');
    const file = path.join(svc, 'a.ts');
    fs.writeFileSync(file, 'export const v = 1;\n');
    git('add', 'a.ts');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init');
    fs.writeFileSync(file, 'export const v = 2; // staged\n');
    git('add', 'a.ts');
    fs.writeFileSync(file, 'export const v = 3; // working tree only\n');

    const out: Array<{ path: string; source: string }> = [];
    for await (const batch of new ChronicleInterface(ws).streamBatches([file], 10, true)) out.push(...batch);

    expect(out).toEqual([{ path: file, source: 'export const v = 2; // staged\n' }]);
  });
});
