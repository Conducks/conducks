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

  it('should show status', () => {
    const output = execSync(`node ${cliPath} status`).toString();
    expect(output).toContain('🏺 Graph Status');
  });

  it('should run analyze (pulse)', () => {
    // skip if git repo wasn't initialized correctly
    if (!fs.existsSync(path.join(testRepo, '.git'))) return;
    
    // Create a non-ignored file in a safe subdirectory
    const srcDir = path.join(testRepo, 'src');
    if (!fs.existsSync(srcDir)) fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, 'feature.ts'), 'export const start = () => console.log("Init");');

    const output = execSync(`node ${cliPath} analyze`, { cwd: testRepo }).toString();
    
    // Check for the core structural milestones (Shield emoji indicates pulse initiation)
    expect(output).toContain('🛡️ [Conducks] Structural Ignore');
    expect(output).toContain('analyze.execute() completed.');
  });

  it('should run entropy analysis', () => {
    const output = execSync(`node ${cliPath} entropy some::symbol`).toString();
    expect(output).toContain('Structural Entropy');
  });
});
