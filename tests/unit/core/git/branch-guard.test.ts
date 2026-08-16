import { describe, it, expect, afterEach } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ChronicleInterface, branchMismatch, branchRefusalMessage } from '@/lib/core/git/chronicle-interface.js';
import { branchGuard } from '@/interfaces/cli/index.js';
import { SynapsePersistence } from "@/lib/core/persistence/index.js";

/**
 * The branch guard (ADR 0035, todo20#P1).
 *
 * The failure it exists to stop is silent: check out another branch and every question — impact,
 * cycles, dead code, coverage — is answered confidently from a graph describing the tree you left.
 * Nothing warns, and the answer looks exactly like a correct one.
 *
 * `branchGuard` is imported from `interfaces/cli/index.ts`, which is the SHIPPED guard the CLI
 * calls, not a copy of it — a reimplementation here would pass while the wiring rotted.
 */

const roots: string[] = [];
const mkRepo = (branch: string): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-branch-'));
  roots.push(root);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  git('init', '-q', '-b', branch);
  git('config', 'user.email', 'test@conducks.local');
  git('config', 'user.name', 'conducks test');
  fs.writeFileSync(path.join(root, 'a.txt'), 'a');
  git('add', '.');
  git('commit', '-qm', 'first');
  return root;
};
const checkoutNew = (root: string, branch: string) =>
  execFileSync('git', ['checkout', '-q', '-b', branch], { cwd: root, stdio: 'ignore' });

/** Writes a pulse row directly: the guard reads `pulses`, not the graph, so no analysis is needed. */
const recordPulse = async (root: string, branch: string | null): Promise<SynapsePersistence> => {
  const p = new SynapsePersistence(root, false);
  await p.run(
    `INSERT INTO pulses (id, timestamp, commitHash, branch, nodeCount, edgeCount, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['p1', Date.now(), 'deadbeef', branch, 0, 0, '{}']
  );
  return p;
};

afterEach(() => { for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true }); });

describe('branchMismatch — null on either side is a real state, not a mismatch', () => {
  it('reports a mismatch only when both sides name a branch and they differ', () => {
    expect(branchMismatch('main', 'feature/x')).toEqual({ vault: 'main', checkout: 'feature/x' });
    expect(branchMismatch('main', 'main')).toBeNull();
  });

  it.each([
    ['a detached HEAD at pulse time', null, 'main'],
    ['a detached HEAD right now', 'main', null],
    ['a vault older than the branch column', undefined, 'main'],
    ['no repository at all', null, null],
  ])('does not refuse on %s', (_case, vault, checkout) => {
    expect(branchMismatch(vault as any, checkout as any)).toBeNull();
  });
});

describe('branchGuard — a read command refuses rather than answering from the wrong tree', () => {
  it('refuses after a branch switch and NAMES BOTH branches', async () => {
    const root = mkRepo('alpha');
    const p = await recordPulse(root, 'alpha');
    try {
      checkoutNew(root, 'beta');

      const refusal = await branchGuard(p, new ChronicleInterface(root));

      expect(refusal).not.toBeNull();
      // Both names, because "your graph is stale" sends the reader to `analyze` without telling
      // them WHY every answer they just read was wrong.
      expect(refusal).toContain('alpha');
      expect(refusal).toContain('beta');
      expect(refusal!.toLowerCase()).toContain('refusing');
    } finally { await p.close(); }
  }, 60000);

  it('stays silent while the checkout is still on the branch that was pulsed', async () => {
    const root = mkRepo('alpha');
    const p = await recordPulse(root, 'alpha');
    try {
      expect(await branchGuard(p, new ChronicleInterface(root))).toBeNull();
    } finally { await p.close(); }
  }, 60000);

  it('stays silent on a detached HEAD — no branch is not the wrong branch', async () => {
    const root = mkRepo('alpha');
    const p = await recordPulse(root, 'alpha');
    try {
      const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
      execFileSync('git', ['checkout', '-q', head], { cwd: root, stdio: 'ignore' });

      const chronicle = new ChronicleInterface(root);
      expect(chronicle.getCurrentBranch()).toBeNull();
      expect(await branchGuard(p, chronicle)).toBeNull();
    } finally { await p.close(); }
  }, 60000);

  it('stays silent for a vault that has never been pulsed', async () => {
    const root = mkRepo('alpha');
    const p = new SynapsePersistence(root, false);
    try {
      await p.query('SELECT 1');                 // force the schema up without writing a pulse
      expect(await branchGuard(p, new ChronicleInterface(root))).toBeNull();
    } finally { await p.close(); }
  }, 60000);

  it('names the branches in the message the CLI actually prints', () => {
    const msg = branchRefusalMessage({ vault: 'main', checkout: 'feature/x' });
    expect(msg).toContain("'main'");
    expect(msg).toContain("'feature/x'");
    // `--force`, not a bare `analyze`. MEASURED on a two-branch fixture: a branch switch changes no
    // file mtime, so plain `analyze` finds nothing dirty (`domain/analysis/index.ts:163`), writes no
    // pulse, and the refusal fires again — the message would send the reader into an endless loop.
    expect(msg).toContain('conducks analyze --force');
  });
});
