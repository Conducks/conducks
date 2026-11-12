import { describe, it, expect, afterEach } from '@jest/globals';
import { SynapsePersistence } from "@/lib/core/persistence/index.js";
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * CLI lifecycle findings from the state-machine audit (2026-11-12, 08-cli-lifecycle.md).
 */
const repos: string[] = [];
afterEach(() => { while (repos.length) rmRepo(repos.pop()!); });

const analyzed = (prefix: string) => {
  ensureBuild();
  const repo = mkGitRepo(prefix);
  repos.push(repo);
  writeFile(repo, 'src/a.ts', 'export function first() { return 1; }\n');
  commit(repo, 'init');
  runCli(['analyze', '--yes'], { cwd: repo });
  return repo;
};

async function names(repo: string): Promise<string[]> {
  const vault = new SynapsePersistence(repo, true);
  try {
    return (await vault.query("SELECT name FROM nodes WHERE file LIKE '%/src/a.ts' AND canonicalKind <> 'UNIT' ORDER BY name")).map((r: any) => r.name);
  } finally { await vault.close(); }
}

describe('CLI lifecycle state', () => {
  /**
   * P-08-3: `guard` is not `analyze`, so the dispatcher opened the vault READ-ONLY, and `guard
   * --force` ran a whole analysis whose writes all returned early — then logged "Pulse recorded."
   * The next command still read the old graph.
   */
  it('guard --force really records the pulse it says it recorded', async () => {
    const repo = analyzed('guard-force');
    writeFile(repo, 'src/a.ts', 'export function first() { return 1; }\nexport function second() { return 2; }\n');
    runCli(['guard', '--force'], { cwd: repo, allowFail: true });
    expect(await names(repo)).toEqual(['first', 'second']);
  }, 240000);

  /**
   * P-08-4 claimed that, run from project A, `entry <B>` loaded B's vault INTO the graph already
   * loaded from A and built B's `--json` paths on A's root. MEASURED: not reproduced — this passed
   * on the unfixed build (the read command's graph is deferred, so A is never loaded into it). Kept
   * as a pin so a change to the deferral cannot bring the mix in silently.
   */
  it('entry <path> answers for that project alone, with paths that open', async () => {
    const fs = await import('node:fs');
    const mk = (prefix: string, mainName: string) => {
      const repo = analyzedWith(prefix, {
        [`src/${mainName}.ts`]: `import { helper } from './lib.js';\nexport function ${mainName}Run() { return helper(); }\n`,
        'src/lib.ts': 'export function helper() { return 1; }\n',
      });
      return repo;
    };
    const a = mk('entry-a', 'main');
    const b = mk('entry-b', 'index');
    const own = JSON.parse(runCli(['entry', '--json'], { cwd: b }).stdout) as Array<{ file: string }>;
    expect(own.length).toBeGreaterThan(0);

    const fromA = JSON.parse(runCli(['entry', b, '--json'], { cwd: a }).stdout) as Array<{ file: string }>;
    expect(fromA.map(e => e.file.split('/').pop()).sort()).toEqual(own.map(e => e.file.split('/').pop()).sort());
    expect(fromA.every(e => fs.existsSync(e.file))).toBe(true);
  }, 300000);

  /**
   * P-08-5: `link` wrote `.conducks/links.json` in the CURRENT directory without walking up to the
   * project, so `cd src && conducks link ../../other` created `src/.conducks/` — which every later
   * command then took for the project root (ADR 0116).
   */
  it('link from a subdirectory records the link at the project, not there', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const host = analyzed('link-host');
    const other = analyzed('link-other');
    runCli(['link', other], { cwd: path.join(host, 'src'), allowFail: true });
    expect(fs.existsSync(path.join(host, 'src', '.conducks'))).toBe(false);
    expect(fs.readFileSync(path.join(host, '.conducks', 'links.json'), 'utf8')).toContain(path.basename(other));
  }, 300000);

  /**
   * P-08-8: a write session publishes a reader SNAPSHOT of the vault (`<db>.reader`) and removes it in
   * `close()`. `clean` never closed its write handle, so a full copy of the PRE-clean graph stayed on
   * disk — and the lock fallback serves that copy to readers.
   */
  /**
   * P-09-8: with no third-party dependency `supply-chain --json` said `advisories.available: false`,
   * which everywhere else in that payload means "vulnerability status UNKNOWN" — for a project with
   * nothing to audit. `needed: false` tells the two apart.
   */
  it('supply-chain --json on a project with no dependencies says no audit was needed', () => {
    const repo = analyzed('supply-none');
    const { stdout } = runCli(['supply-chain', '--json'], { cwd: repo });
    const got = JSON.parse(stdout);
    expect(got.analysed).toBe(true);
    expect(got.advisories).toEqual({ available: false, needed: false });
  }, 240000);

  it('clean leaves no reader snapshot behind', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const repo = analyzed('clean-snapshot');
    runCli(['clean'], { cwd: repo, allowFail: true });
    const left = fs.readdirSync(path.join(repo, '.conducks')).filter(f => f.includes('.reader'));
    expect(left).toEqual([]);
  }, 240000);

  /**
   * P-08-8 / P-08-9 for `watch --pulse`: its write handle was never closed, so the reader snapshot
   * outlived the session; and a SIGTERM during a SIGINT shutdown ran the whole shutdown a second time.
   */
  it('watch --pulse shuts down once, on two signals, and leaves no reader snapshot', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { spawn } = await import('node:child_process');
    const repo = analyzed('watch-shutdown');
    const proc = spawn('node', [path.resolve('build/src/interfaces/cli/index.js'), 'watch', '--pulse'], {
      cwd: repo, env: { ...process.env, CHOKIDAR_USEPOLLING: '1', CHOKIDAR_INTERVAL: '250' },
    });
    let out = '';
    proc.stdout.on('data', d => { out += String(d); });
    proc.stderr.on('data', d => { out += String(d); });
    const exited = new Promise<void>(r => proc.on('exit', () => r()));
    try {
      const end = Date.now() + 40000;
      while (!/Auto-Pulse Mode/.test(out) && Date.now() < end) await new Promise(r => setTimeout(r, 200));
      expect(out).toMatch(/Auto-Pulse Mode/);
      proc.kill('SIGINT');
      proc.kill('SIGTERM');
      await Promise.race([exited, new Promise(r => setTimeout(r, 15000))]);
    } finally {
      proc.kill('SIGKILL');
    }
    expect((out.match(/Shutting down watcher/g) ?? []).length).toBe(1);
    expect(fs.readdirSync(path.join(repo, '.conducks')).filter(f => f.includes('.reader'))).toEqual([]);
  }, 240000);
});

function analyzedWith(prefix: string, files: Record<string, string>): string {
  ensureBuild();
  const repo = mkGitRepo(prefix);
  repos.push(repo);
  for (const [p, c] of Object.entries(files)) writeFile(repo, p, c);
  commit(repo, 'init');
  runCli(['analyze', '--yes'], { cwd: repo });
  return repo;
}
