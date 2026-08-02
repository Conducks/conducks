import { describe, it, expect, beforeAll } from '@jest/globals';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

describe('Conducks CLI Integration', () => {
  const cliPath = path.resolve('build/src/interfaces/cli/index.js');
  const testRepo = path.resolve('tests/fixtures/mock-repo');

  beforeAll(() => {
    // Ensure build exists
    if (!fs.existsSync(cliPath)) {
      execSync('npm run build');
    }
    
    // Setup mock repo
    if (!fs.existsSync(testRepo)) {
      fs.mkdirSync(testRepo, { recursive: true });
      try {
        execSync('git init', { cwd: testRepo, stdio: 'ignore' });
        fs.writeFileSync(path.join(testRepo, 'index.ts'), 'export const x = 1;');
        execSync('git add . && git commit -m "init"', { cwd: testRepo, stdio: 'ignore' });
      } catch (e) {
        console.warn('Git init failed in integration test, some tests may be skipped.');
      }
    }
  });

  it('should show help message', () => {
    const output = execSync(`node ${cliPath} help`).toString();
    expect(output).toContain('watch');
    expect(output).toContain('analyze');
  });

  it('should run analyze (pulse)', () => {
    // skip if git repo wasn't initialized correctly
    if (!fs.existsSync(path.join(testRepo, '.git'))) return;
    
    // Create a non-ignored file in a safe subdirectory
    const srcDir = path.join(testRepo, 'src');
    if (!fs.existsSync(srcDir)) fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, 'feature.ts'), 'export const start = () => console.log("Init");');
    
    // Add a file clearly in the ignore list to trigger the log message
    const ignoreDir = path.join(testRepo, 'node_modules');
    if (!fs.existsSync(ignoreDir)) fs.mkdirSync(ignoreDir);
    fs.writeFileSync(path.join(ignoreDir, 'ignored.ts'), 'export const x = 1;');

    const output = execSync(`node ${cliPath} analyze 2>&1`, { cwd: testRepo }).toString();
    
    // Check for the core structural milestones (Shield emoji indicates pulse initiation)
    expect(output).toContain('🛡️ [Conducks] Structural Ignore');
    expect(output).toContain('🛡️ [Conducks] Structural Resonance Complete.');
  });

  it('show status', () => {
    const output = execSync(`node ${cliPath} status`, { cwd: testRepo }).toString();
    expect(output).toContain('🏺 Structural Synapse Status');
  });

  /**
   * REVERSED 2026-08-02 (ADR 0115). This called `entropy some::symbol` — an id no node has — and
   * asserted the output contained "Structural Entropy". It passed because the command printed
   * `0.0000`, `0` authors and `0.00%` risk for a symbol that does not exist, and the assertion was
   * satisfied by the header of a fabricated measurement.
   *
   * A test that requires a wrong answer keeps it. The command now refuses, so this asserts the
   * refusal, and a REAL symbol is measured separately below.
   */
  it('refuses entropy for a symbol that does not exist', () => {
    let status = 0;
    let output = '';
    try {
      output = execSync(`node ${cliPath} entropy some::symbol 2>&1`, { cwd: testRepo }).toString();
    } catch (err: any) {
      status = err.status ?? 1;
      output = String(err.stdout ?? '') + String(err.stderr ?? '');
    }
    expect(status).not.toBe(0);
    expect(output).toMatch(/not found/i);
  });

  it('measures entropy for a symbol that exists', () => {
    // `feature.ts` is the one node this fixture's vault reliably holds — its only source symbol is
    // an arrow-function const, which the ATOM edge gate may prune (ADR 0013).
    const output = execSync(`node ${cliPath} entropy feature.ts`, { cwd: testRepo }).toString();
    expect(output).toContain('Structural Entropy');
  });
});
