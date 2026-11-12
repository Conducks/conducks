import { describe, it, expect, afterAll } from '@jest/globals';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo, cliPath } from './helpers.js';

/**
 * A file saved WHILE a pulse runs, after the pulse read it, must be dirty for the next analyze
 * (state-machine audit P-06-2).
 *
 * The incremental gate compares each file's mtime with the last pulse's timestamp, and that
 * timestamp was taken at the END of the pulse. A save that lands after the file was read but before
 * the pulse finished has an mtime OLDER than the timestamp, and its content hash is the old one — so
 * the next analyze answered "already at 100% resonance" over a file whose new symbols it never read.
 *
 * The save is made for real, mid-pulse: once the run logs `[Wave 1] Flushing structural delta` the
 * file has been parsed, and the pulse record is not yet written. (Saving at `[Pass 1]` was too early:
 * the new content was still parsed, so the test passed without the fix.)
 */
const repos: string[] = [];
afterAll(() => { while (repos.length) rmRepo(repos.pop()!); });

describe('a save during a pulse', () => {
  it('is picked up by the next analyze', async () => {
    ensureBuild();
    const repo = mkGitRepo('mid-pulse');
    repos.push(repo);
    writeFile(repo, 'src/a.ts', 'export function before(): number { return 1; }\n');
    for (let i = 0; i < 40; i++) writeFile(repo, `src/filler${i}.ts`, `export function filler${i}(): number { return ${i}; }\n`);
    commit(repo, 'init');

    const file = path.join(repo, 'src/a.ts');
    const saved = await new Promise<boolean>((resolve) => {
      const proc = spawn('node', [cliPath, 'analyze', '--yes'], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      let done = false;
      const onData = (d: Buffer) => {
        out += String(d);
        if (!done && /\[Wave 1\] Flushing structural delta/.test(out)) {
          done = true;
          fs.writeFileSync(file, 'export function before(): number { return 1; }\nexport function duringPulse(): number { return 2; }\n');
        }
      };
      proc.stdout.on('data', onData);
      proc.stderr.on('data', onData);
      proc.on('exit', () => resolve(done));
    });
    expect(saved).toBe(true);

    runCli(['analyze', '--yes'], { cwd: repo });

    const out = runCli(['query', 'duringPulse', '--json'], { cwd: repo }).stdout;
    expect(out).toMatch(/"name"\s*:\s*"duringPulse"/i);
  }, 180000);
});
