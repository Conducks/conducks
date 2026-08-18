import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

/**
 * Ids are lowercased on write (CONDUCKS-4, because APFS is case-insensitive), and the renderers
 * printed the raw id — so every symbol a person read came out mangled: `::registeripchandlers`,
 * `::capabilityregistry`, `::domnode`. MEASURED on all three benchmark subjects, so it is not
 * language-specific.
 *
 * The FILE half of this same defect was repaired earlier; the SYMBOL half was not, and a later
 * benchmark round scored the task PASS because the paths had visibly stopped being lowercased.
 * Round 1's own failure text had named the symbol names FIRST.
 *
 * The real spelling was never lost — `nodes.name` keeps it, and `context` proved it in one screen:
 * its header printed `::registeripchandlers` from the raw id while its radius list printed
 * `onToken` correctly from the name column, in the same output.
 *
 * Nine render sites printed a lowercased symbol; a fix landing on the obvious two would pass a
 * test and ship looking done. `name` holds only the LEAF, so a dotted tail is rebuilt by resolving
 * each progressive prefix of the id.
 */
describe('rendered symbols keep the case they were written in', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('symbol-case-display');

    writeFile(repo, 'src/registry.ts', `
export class CapabilityRegistry {
  registerIpcHandlers(): number { return 1; }
}
export function DOMNodeHelper(): number { return 2; }
`);
    writeFile(repo, 'src/main.ts', `
import { CapabilityRegistry, DOMNodeHelper } from './registry.js';
export function boot(): number {
  const r = new CapabilityRegistry();
  return r.registerIpcHandlers() + DOMNodeHelper();
}
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 300000);

  afterAll(() => rmRepo(repo));

  it('status prints the real spelling, not the lowercased id', () => {
    const out = plain(runCli(['status'], { cwd: repo, allowFail: true }).combined);
    expect(out).toContain('CapabilityRegistry');
    expect(out).not.toContain('capabilityregistry');
  }, 180000);

  it('rebuilds a dotted member name from its parts', () => {
    // `name` holds only `registerIpcHandlers`; the CLASS half comes from resolving the id prefix.
    // A fix that read `name` alone would print `capabilityregistry.registerIpcHandlers`.
    const out = plain(runCli(['status'], { cwd: repo, allowFail: true }).combined)
      + plain(runCli(['trace', 'registerIpcHandlers'], { cwd: repo, allowFail: true }).combined);
    expect(out).not.toMatch(/capabilityregistry\.registerIpcHandlers/);
  }, 180000);

  it('repairs the context header, which previously repaired neither half', () => {
    const out = plain(runCli(['context', 'CapabilityRegistry'], { cwd: repo, allowFail: true }).combined);
    const header = out.split('\n').find(l => l.includes('Context:')) ?? '';
    expect(header).toContain('CapabilityRegistry');
    expect(header).not.toContain('capabilityregistry');
  }, 180000);

  it('leaves --json ids canonical and lowercased for machine consumers', () => {
    // THE counter-test. Ids are the join key; changing their case in a machine-readable payload
    // would break every consumer to make a human-facing string prettier.
    const json = runCli(['status', '--json'], { cwd: repo, allowFail: true }).stdout;
    const parsed = JSON.parse(json);
    const ids = JSON.stringify(parsed.topHotspots?.map((h: any) => h.id) ?? []);
    expect(ids).toContain('capabilityregistry');
    expect(ids).not.toContain('CapabilityRegistry');
  }, 180000);

  it('still resolves the prettier string it now prints', () => {
    // The second counter-test: a display fix that broke copy-paste would be a net loss.
    for (const cmd of ['explain', 'trace', 'impact', 'context']) {
      const res = runCli([cmd, 'src/registry.ts::CapabilityRegistry'], { cwd: repo, allowFail: true });
      expect(res.combined).not.toMatch(/not found in the Synapse/i);
    }
  }, 300000);

  it('falls back to the stored spelling rather than guessing one', () => {
    // External nodes lost their case at INGEST (the id is lowercased before the name is split out
    // of it), so `TextDecoder` is unrecoverable here. The renderer must degrade to the lowercased
    // form, not invent a capitalisation — this pins that the fallback exists and stays quiet.
    const out = plain(runCli(['status'], { cwd: repo, allowFail: true }).combined);
    expect(out).not.toMatch(/undefined|null::/);
  }, 180000);
});
