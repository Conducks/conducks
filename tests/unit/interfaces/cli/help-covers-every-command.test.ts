import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

/**
 * ADR 0125 — a command the help does not list is a command nobody finds.
 *
 * `help` renders from a HARDCODED domain map of command ids. Anything added to the CLI and not added
 * to that map is invisible: it receives the real command list in its constructor and uses it only to
 * look descriptions UP, never to check the map is complete.
 *
 * Measured: 32 of 39 commands listed. The seven missing were
 *
 *     coverage  coverage-view  docs-lint  docs-status  ledger  monitor  supply-chain
 *
 * including `docs-lint`, which is the documented CI gate, and `coverage`, which four ADRs in this
 * sweep were spent fixing. Every one of them works; none could be discovered from the tool itself.
 *
 * The catch-all group in `help` means a new command can never be silently absent again. This test is
 * the thing that fails if the catch-all is ever removed — it reads the command DIRECTORY, so adding
 * a file is enough to be covered by it.
 */
describe('help lists every command the CLI registers', () => {
  it('names every command file in its output groups', async () => {
    const dir = path.resolve('src/interfaces/cli/commands');
    const ids = fs.readdirSync(dir)
      .filter(f => f.endsWith('.ts'))
      .map(f => f.replace(/\.ts$/, ''))
      .sort();

    const { HelpCommand } = await import('@/interfaces/cli/commands/help.js');
    // Stand-ins: `help` only reads `id` and `description` off each command.
    const stubs = ids.map(id => ({ id, description: `desc for ${id}`, usage: '', execute: async () => {} }));

    const lines: string[] = [];
    const realLog = console.log;
    console.log = (...a: unknown[]) => { lines.push(a.join(' ')); };
    try {
      await new HelpCommand(stubs as never).execute([], {} as never);
    } finally {
      console.log = realLog;
    }
    // ANSI codes sit immediately after each id (`   ${id}\x1b[2m…`), so a whitespace-bounded match
    // finds nothing at all until they are stripped — which looked like "every command is missing".
    const output = lines.join('\n').replace(/\x1b\[[0-9;]*m/g, '');

    const missing = ids.filter(id => !new RegExp(`(^|\\s)${id}(\\s|$)`, 'm').test(output));
    expect(missing).toEqual([]);
  });
});
