import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { assessRoot } from '@/lib/core/utils/scope-guard.js';

// `conducks analyze ~/Documents` used to just start: hours of pulse, a vault written into a folder
// that is not a project. The guard's job is to tell a project from a place projects happen to live.
describe('scope-guard — a project root, not just any path', () => {
  let root = '';
  beforeAll(() => { root = mkdtempSync(path.join(tmpdir(), 'conducks-scope-')); });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('demands a double confirmation for system, home, cloud-sync and repo-parking roots', () => {
    const roots = [
      '/', '/tmp', '/usr', '/Applications', '/Volumes',
      homedir(),
      ...['Documents', 'Desktop', 'Downloads', 'Library', 'Pictures', 'Projects', 'src', 'code',
          'Dropbox', 'Google Drive', 'OneDrive', '.ssh', '.cargo']
        .map(d => path.join(homedir(), d)),
    ];
    for (const p of roots) expect(assessRoot(p, 50).level).toBe('ask-twice');
  });

  it('treats dependency and build directories as ask-twice wherever they appear', () => {
    for (const name of ['node_modules', 'vendor', 'dist', 'target', '.venv', 'Pods']) {
      const d = path.join(root, name);
      mkdirSync(d, { recursive: true });
      writeFileSync(path.join(d, 'package.json'), '{}');    // a marker must NOT rescue it
      expect(assessRoot(d).level).toBe('ask-twice');
    }
  });

  it('spots a folder OF projects — one pulse there would merge them into a single graph', () => {
    const parent = path.join(root, 'parked');
    for (const p of ['a', 'b', 'c']) {
      mkdirSync(path.join(parent, p), { recursive: true });
      writeFileSync(path.join(parent, p, 'package.json'), '{}');
    }
    const a = assessRoot(parent);
    expect(a.level).toBe('ask-twice');
    expect(a.childProjects).toBe(3);
    expect(a.reasons.join()).toContain('folder OF projects');
  });

  it('passes a directory carrying any project marker', () => {
    const proj = path.join(root, 'proj');
    mkdirSync(proj);
    writeFileSync(path.join(proj, 'package.json'), '{}');
    expect(assessRoot(proj).level).toBe('ok');

    const goProj = path.join(root, 'goproj');
    mkdirSync(goProj);
    writeFileSync(path.join(goProj, 'go.mod'), 'module x');
    expect(assessRoot(goProj).level).toBe('ok');
  });

  it('flags a directory with no marker — a folder of projects is not a project', () => {
    const bare = path.join(root, 'bare');
    mkdirSync(bare);
    const a = assessRoot(bare);
    expect(a.level).toBe('ask');                // one question, not the double gate
    expect(a.reasons.join()).toContain('no project marker');
  });

  it('stops counting at the cap instead of walking the whole tree', () => {
    const big = path.join(root, 'big');
    mkdirSync(big);
    writeFileSync(path.join(big, 'package.json'), '{}');
    for (let i = 0; i < 30; i++) writeFileSync(path.join(big, `f${i}.ts`), 'x');
    const a = assessRoot(big, 10);
    expect(a.cappedAt).toBe(10);
    expect(a.approxFiles).toBeLessThanOrEqual(12);   // stopped early, did not count all 31
    expect(a.reasons.join()).toContain('over 10 files');
  });

  it('treats a missing path as risky rather than throwing', () => {
    const a = assessRoot(path.join(root, 'nope'));
    expect(a.level).toBe('ask-twice');
    expect(a.reasons.join()).toContain('does not exist');
  });
});
