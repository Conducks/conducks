/**
 * A tracked text file never carries a path from someone's machine. Captured tool output, a
 * diagnostics log and a hard-coded root once shipped an absolute home directory to the public
 * repo (found by a leak scan, 2026-11-11). A path like that is private information and is wrong on
 * every other machine, so it is refused at the gate instead of cleaned up after the push.
 */
import { describe, it, expect } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HOME_PATH = /(^|[^a-z0-9_])(?:\/Users|\/home)\/([a-z][a-z0-9._-]*)\//gi;
/** A fixture that needs an absolute path spells its home with one of these names, never a real one. */
const SYNTHETIC = new Set(['me', 'dev', 'you', 'x']);
const TEXT = /\.(ts|tsx|js|mjs|cjs|json|jsonl|md|txt|toml|yml|yaml|scm|sh|py|rs|html|css|csv)$/i;

describe('no home-directory paths in tracked files', () => {
  it('finds none', () => {
    const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
    const offenders: string[] = [];
    for (const rel of tracked) {
      if (!TEXT.test(rel) || rel === 'package-lock.json' || rel.startsWith('tests/architecture/no-home-paths')) continue;
      const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
      lines.forEach((l, i) => {
        for (const m of l.matchAll(HOME_PATH)) {
          if (!SYNTHETIC.has(m[2].toLowerCase())) offenders.push(`${rel}:${i + 1}  ${l.trim().slice(0, 100)}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
