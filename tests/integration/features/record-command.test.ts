import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * ADR 0122 — `record` wrote the wrong content to the wrong file and reported success.
 *
 * Four defects, compounding, all measured:
 *
 *   conducks record "a conventions note" --type conventions
 *     → "✅ Recorded in docs/memory.md"          the type is read only when `--type` is args[0]
 *     → the file contains the word "conventions"  content is args[args.length-1], which is the
 *                                                 FLAG VALUE, so the note itself is discarded
 *   conducks record --type=nonsensetype "x"
 *     → writes docs/nonsensetype.md               no validation against the seven documented types
 *   every file it writes
 *     → fails `conducks docs-lint`                no `# Title`, which the grammar requires
 *
 * A command that silently saves the wrong text to the wrong place and prints a tick is worse than
 * one that fails: the user believes the note is recorded and finds out months later that it is not.
 */
describe('record writes what was asked, where it was asked', () => {
  let repo: string;
  const docs = (f: string) => path.join(repo, 'docs', f);

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('record-cmd');
    writeFile(repo, 'src/a.ts', 'export const a = 1;\n');
    commit(repo, 'init');
  }, 300000);

  afterAll(() => rmRepo(repo));

  it('honours --type when it is not the first argument', () => {
    runCli(['record', 'never use console.log in production', '--type', 'vision'], { cwd: repo });
    expect(fs.existsSync(docs('vision.md'))).toBe(true);
    expect(fs.readFileSync(docs('vision.md'), 'utf8')).toMatch(/never use console\.log/);
  }, 120000);

  it('records the note, not the flag value', () => {
    runCli(['record', '--type', 'implementation', 'the vault locks during a pulse'], { cwd: repo });
    const body = fs.readFileSync(docs('implementation.md'), 'utf8');
    expect(body).toMatch(/the vault locks during a pulse/);
    // The old version stored the LAST argument, which for `--type implementation <note>` order was
    // the note but for `<note> --type implementation` was the word "implementation".
    expect(body.trim()).not.toMatch(/^implementation$/m);
  }, 120000);

  /**
   * ADR 0193 dissolved `architecture`, `conventions` and `memory` into the module notes. The risk
   * is not that the flag errors — it is that it SUCCEEDS and recreates a file this repo deleted,
   * in a tree the standard no longer defines. The refusal has to name where the fact belongs, or
   * the user simply loses the note they were trying to keep.
   */
  it.each(['conventions', 'memory', 'architecture'])('refuses --type %s and says where the fact goes now', (dissolved) => {
    const { combined, status } = runCli(['record', '--type', dissolved, 'x'], { cwd: repo, allowFail: true });
    expect(status).not.toBe(0);
    expect(fs.existsSync(docs(`${dissolved}.md`))).toBe(false);
    expect(combined).toMatch(/dissolved into the module notes/);
    expect(combined).toMatch(/ADR 0193/);
  }, 120000);

  it('refuses a type the standard does not define', () => {
    const { combined, status } = runCli(['record', '--type=nonsensetype', 'x'], { cwd: repo, allowFail: true });
    expect(status).not.toBe(0);
    expect(combined).toMatch(/nonsensetype/);
    expect(fs.existsSync(docs('nonsensetype.md'))).toBe(false);
  }, 120000);

  /** The docs standard is this project's own, and `record` is the command that writes into it. */
  it('writes a file that passes docs-lint', () => {
    runCli(['record', '--type', 'implementation', 'a second note'], { cwd: repo });
    const { combined, status } = runCli(['docs-lint'], { cwd: repo, allowFail: true });
    expect(combined).not.toMatch(/implementation\.md/);
    expect(status).toBe(0);
  }, 180000);
});

/**
 * ADR 0122 — `supply-chain --json` was advertised and did not exist.
 *
 * This one is mine: ADR 0119 derived each command's flag set from a regex over its source, and for
 * `supply-chain` the pattern matched `json_extract_string(...)` inside a SQL string rather than a
 * flag read. So `[--json]` was added to a usage string for a flag the command never had, and the
 * dispatcher then accepted it and printed human output.
 */
describe('supply-chain answers in JSON as advertised', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('supply-cmd');
    writeFile(repo, 'package.json', JSON.stringify({ name: 'fx', dependencies: { chalk: '^5.0.0' } }, null, 2));
    writeFile(repo, 'src/a.ts', "import chalk from 'chalk';\nexport const a = () => chalk.red('x');\n");
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 300000);

  afterAll(() => rmRepo(repo));

  it('emits parseable JSON', () => {
    const { stdout } = runCli(['supply-chain', '--json'], { cwd: repo, allowFail: true });
    expect(() => JSON.parse(stdout)).not.toThrow();
  }, 120000);
});
