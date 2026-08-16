import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { ChronicleInterface } from '@/lib/core/git/chronicle-interface.js';

/**
 * ADR 0047 — a filename in an analysed repository cannot execute commands.
 *
 * Every git call used to be a template string run through `execSync`, which is `/bin/sh -c`, with a
 * repo-relative path interpolated into it:
 *
 *     git log --format="%ae" -- "${relativePath}"
 *
 * `relativePath` comes from `git ls-files`, so it is attacker-controlled in any cloned repository,
 * and git permits filenames containing a double quote and `$(...)`. A file named to close the quote
 * and open a subshell therefore ran arbitrary commands the moment anything asked for its history.
 *
 * The canary is a file the injected payload would create. If it exists after the calls below, the
 * shell ran; if it does not, the argument array held.
 */
describe('a hostile filename cannot execute commands', () => {
  let repo: string;
  let canary: string;
  let hostileName: string;
  let created = false;
  // The payload must contain NO slash, or it is not a legal filename and git never stores it. The
  // first version of this test used an absolute canary path, so the file was never created, the
  // test self-skipped, and it passed while proving nothing — the exact failure CONDUCKS-34 warns
  // about. Verified against the old code path: `execSync` with this name DOES create the canary.

  beforeAll(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-inject-'));
    // Relative to the repo, because the payload runs with cwd = repo.
    canary = path.join(repo, 'pwned');
    // Closes the double quote, runs `touch pwned`, reopens a quote so the rest still parses.
    hostileName = 'a";touch pwned;echo "b.ts';
    execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 't@t'], { cwd: repo, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 't'], { cwd: repo, stdio: 'ignore' });
    try {
      fs.writeFileSync(path.join(repo, hostileName), 'export const x = 1;\n');
      execFileSync('git', ['add', '-A'], { cwd: repo, stdio: 'ignore' });
      execFileSync('git', ['commit', '-m', 'hostile'], { cwd: repo, stdio: 'ignore' });
      created = true;
    } catch {
      // Some filesystems reject these characters. Then the attack is impossible here anyway and the
      // test self-skips rather than passing for the wrong reason.
      created = false;
    }
  });

  afterAll(() => {
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(canary, { force: true });
  });

  it('does not run an injected command through any git call', async () => {
    // Not a soft skip: if the fixture could not be built, this test cannot prove anything and says
    // so loudly rather than passing.
    expect(created).toBe(true);
    const chronicle = new ChronicleInterface(repo);
    const target = path.join(repo, hostileName);

    // Every call site that takes a filename. `getFileHistory` was MISSING from this list and is the
    // one the pulse actually runs on every file — the list had been written against the methods it
    // replaced and never followed the supersession.
    await chronicle.getFileHistory(target);
    await chronicle.getAuthorDistribution(target);
    await chronicle.getBlameData(target);
    await chronicle.readFile(target, true);

    expect(fs.existsSync(canary)).toBe(false);
  });
});
