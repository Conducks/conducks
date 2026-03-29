import { describe, it, expect, beforeAll } from '@jest/globals';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

describe('Conducks CLI Integration', () => {
  const cliPath = path.resolve('build/src/cli.js');
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
    
    const output = execSync(`node ${cliPath} analyze`, { cwd: testRepo }).toString();
    expect(output).toContain('[Conducks] Analyzing Project Structure');
    expect(output).toContain('📊 Graph Analysis Result');
  });

  it('should run entropy analysis', () => {
    const output = execSync(`node ${cliPath} entropy some::symbol`).toString();
    expect(output).toContain('Structural Entropy');
  });
});
