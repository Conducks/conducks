import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

/**
 * ADR 0119 — every flag a command reads is a flag it advertises.
 *
 * The dispatcher rejects a flag that is not in the command's `usage` string, which makes usage the
 * single source of truth for the flag surface. That only works if usage is COMPLETE: a command
 * reading a flag it does not advertise becomes a command whose flag is now rejected — a working
 * option turned into an error by the very check meant to protect it.
 *
 * That is not hypothetical. Adding the dispatcher check broke four real flags in one commit:
 *
 *     docs-status --root-only     supply-chain --json
 *     mirror --watch              watch --pulse
 *
 * **The full suite stayed green through all four.** No test drove them, so nothing noticed until
 * they were tried by hand. This test is the thing that would have noticed.
 *
 * It reads the command SOURCES rather than the built classes on purpose: the flag literals are what
 * the parser actually compares against, and a test that imported the classes could only check the
 * usage strings against each other.
 */
describe('every flag a command reads is a flag it advertises', () => {
  const dir = path.resolve('src/interfaces/cli/commands');

  // Handled by the dispatcher for every command, so no usage string lists them.
  const GLOBAL = new Set(['--help', '--verbose']);

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts'));

  it.each(files)('%s advertises every flag it reads', (file) => {
    const src = fs.readFileSync(path.join(dir, file), 'utf8');

    const usage = src.match(/public usage\s*=\s*["'`](.*?)["'`]/s)?.[1] ?? '';
    const declared = new Set(usage.match(/--[a-z][a-z0-9-]*/g) ?? []);

    // Flag literals the parser compares against: `args.includes('--x')`, `args.indexOf('--x')`,
    // `a.startsWith('--x')`. A bare `'--x'` anywhere else in the file would be a false positive, so
    // the match is anchored on those three call shapes.
    const read = new Set(
      [...src.matchAll(/\.(?:includes|indexOf|startsWith)\(\s*["'](--[a-z][a-z0-9-]*)["']/g)].map(m => m[1])
    );

    const undeclared = [...read].filter(f => !declared.has(f) && !GLOBAL.has(f));
    expect(undeclared).toEqual([]);
  });
});
