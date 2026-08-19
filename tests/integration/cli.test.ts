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
   * `audit --json` MUST NOT lose bytes when stdout is a pipe.
   *
   * The command printed its payload and then called `process.exit(1)` on the violations branch.
   * `process.exit` does not wait for stdout to drain, and a pipe holds 64 KiB — so every caller
   * that read the JSON through a pipe got it cut off at exactly 65536 bytes and a parse error,
   * while the same command redirected to a FILE wrote all of it. MEASURED on the frozen benchmark
   * subject `orchestrator`: 69228 bytes to a file, 65536 through a pipe.
   *
   * It went unseen because the truncation needs MORE than 64 KiB of findings to show up at all.
   * The two small subjects parsed fine, and `health.mjs` swallowed the failure on the big ones —
   * so the harness that existed to catch this printed nothing.
   *
   * The fixture therefore has to be big enough to exceed one pipe buffer, or the test passes
   * whether or not the bug is present. 180 mutually-importing pairs produce ~103 KB of CIRCULAR
   * violations.
   */
  describe('audit --json survives a pipe', () => {
    const bigRepo = path.resolve('tests/fixtures/audit-pipe-repo');

    beforeAll(() => {
      if (!fs.existsSync(path.join(bigRepo, '.git'))) {
        fs.mkdirSync(path.join(bigRepo, 'src'), { recursive: true });
        for (let i = 0; i < 180; i++) {
          fs.writeFileSync(path.join(bigRepo, 'src', `a${i}.ts`),
            `import { b${i} } from "./b${i}.js";\nexport const a${i} = () => b${i}();\n`);
          fs.writeFileSync(path.join(bigRepo, 'src', `b${i}.ts`),
            `import { a${i} } from "./a${i}.js";\nexport const b${i} = () => a${i}();\n`);
        }
        execSync('git init -q . && git add -A && git commit -qm init', { cwd: bigRepo, stdio: 'ignore' });
      }
      execSync(`node ${cliPath} analyze . --yes --force`, { cwd: bigRepo, stdio: 'ignore' });
    }, 300_000);

    /** The payload has to clear one pipe buffer, or nothing below can fail. */
    it('produces more than one pipe buffer of findings', () => {
      const bytes = execSync(`node ${cliPath} audit --json 2>/dev/null || true`,
        { cwd: bigRepo, maxBuffer: 128 * 1024 * 1024 }).toString().length;
      expect(bytes).toBeGreaterThan(65536);
    }, 120_000);

    it('is complete and parseable through a pipe', () => {
      // `execSync` gives the child a pipe, which is the case that broke.
      let out = '';
      try {
        out = execSync(`node ${cliPath} audit --json`,
          { cwd: bigRepo, maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      } catch (err: any) {
        out = String(err.stdout ?? '');   // violations exit 1 — the payload is still the answer
      }
      expect(() => JSON.parse(out)).not.toThrow();
      expect(JSON.parse(out).stats).toBeDefined();
    }, 120_000);

    /**
     * COUNTER-TEST — the case the fix must NOT eat. `audit` is a gate: swapping `process.exit(1)`
     * for `process.exitCode` is only correct if a run with violations still exits non-zero. A fix
     * that flushed the bytes and returned 0 would pass every assertion above and silently disarm
     * the gate.
     */
    it('still exits non-zero when it finds violations', () => {
      let status = 0;
      try {
        execSync(`node ${cliPath} audit --json`,
          { cwd: bigRepo, maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
      } catch (err: any) {
        status = err.status ?? 1;
      }
      expect(status).toBe(1);
    }, 120_000);
  });
});
