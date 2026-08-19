import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * `rename` rewrote ONE SITE PER EDGE, and an edge is not a site.
 *
 * ADR 0110 established that edge ids are content-hashed WITHOUT the line, so a caller naming a
 * symbol forty times still produces ONE edge; every line is collected into `properties.lines`, and
 * `properties.line` was kept as the FIRST of them only so readers written before the array kept
 * working. `impact.ts` was updated to read the array. `gvr-engine.ts` was not.
 *
 * MEASURED on the sofie subject: `electron/main/index.ts` names `safeSend` 54 times from 5 enclosing
 * scopes. Reading the singular field gave 5 edges → 5 sites, plus the declaration = 6. rename
 * rewrote those 6, left 48 calls pointing at a function that no longer existed, and printed
 * "✅ Successfully renamed at 6 site(s)" over a guaranteed compile failure. The dry run promised the
 * same 6 first, so the preview protected nobody. After the fix: 53 sites, 0 orphaned calls, and the
 * single surviving `safeSend` is a mention inside a comment — which must NOT be rewritten.
 *
 * Every pre-existing fixture had exactly one call per caller scope, where per-edge and per-occurrence
 * coincide. That is precisely why this shipped: the suite could not tell the two apart.
 */
describe('rename rewrites every call site, not one per caller', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('rename-repeated');

    writeFile(repo, 'src/emit.ts', 'export function emit(channel: string): number { return channel.length; }\n');

    // ONE caller, MANY calls — the shape no existing fixture had. Under the defect this collapses
    // to a single edge and only the first line is rewritten.
    writeFile(repo, 'src/hub.ts', `
import { emit } from './emit.js';

export function hub(): number {
  // emit is called repeatedly here on purpose — this comment names emit and must survive.
  let n = 0;
  n += emit('one');
  n += emit('two');
  n += emit('three');
  n += emit('four');
  const label = 'emit';       // a string that merely spells the name
  return n + label.length;
}
`);

    // A second caller with ONE call: the case that already worked, kept as a regression guard.
    writeFile(repo, 'src/single.ts', `
import { emit } from './emit.js';
export function single(): number { return emit('only'); }
`);

    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 300000);

  afterAll(() => rmRepo(repo));

  const read = (rel: string) => fs.readFileSync(path.join(repo, rel), 'utf8');

  it('the dry run counts every occurrence, not every edge', () => {
    // The preview lied first, and it is the only thing standing between a user and a broken build.
    const out = runCli(['rename', 'emit', 'emitEvent'], { cwd: repo, allowFail: true }).combined;
    const m = out.replace(/\x1b\[[0-9;]*m/g, '').match(/at (\d+) site\(s\)/);
    expect(m).not.toBeNull();
    // 1 declaration + 4 calls in hub + 1 import in hub + 1 call in single + 1 import in single.
    // Under the defect this reported 5 — one per edge plus the declaration.
    expect(Number(m![1])).toBeGreaterThanOrEqual(7);
  }, 300000);

  it('leaves no call pointing at a name that no longer exists', () => {
    runCli(['rename', 'emit', 'emitEvent', '--confirm'], { cwd: repo });
    const hub = read('src/hub.ts');

    // THE defect: four calls, one rewritten, three orphaned.
    expect(hub.match(/emitEvent\('/g) ?? []).toHaveLength(4);
    // A bare `emit(` surviving would be a call to a deleted function — a broken build.
    expect(hub).not.toMatch(/[^t]\bemit\(/);
    expect(read('src/emit.ts')).toContain('export function emitEvent(');
  }, 300000);

  it('still rewrites the caller that only calls once', () => {
    // The counter-test for the fix's blast radius: the previously-working single-call-per-scope
    // case must be untouched, since that is the shape every other fixture in the suite has.
    const single = read('src/single.ts');
    expect(single).toContain("emitEvent('only')");
    expect(single).not.toMatch(/[^t]\bemit\(/);
  }, 300000);

  it('does not rewrite the name inside a comment or a string', () => {
    // Both survived the real sofie rename and must keep surviving: the sole remaining `safeSend`
    // there was a comment mention, and rewriting prose is not renaming code.
    const hub = read('src/hub.ts');
    expect(hub).toContain('this comment names emit and must survive');
    expect(hub).toContain("const label = 'emit';");
  }, 300000);
});
