import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * ADR 0131 / todo38#P3 — a route lives on ONE node.
 *
 * Synthesised nodes are NAMED with `::` in the name — `ROUTE::/users/profile::GET`. The ingest edge
 * resolver assumed any target containing `::` was already a full node id and skipped the local
 * name→id lookup, so the edge from the defining scope pointed at the bare string. External-symbol
 * induction then saw an unresolved `route::/users/profile::get` target, split it on `::`, read
 * `route` as a PACKAGE NAME, and minted a fake library symbol:
 *
 *     /…/api/server.ts::route::/users/profile::get   real — carries the CALLS from its REQUEST
 *     route::/users/profile::get                     fake — library_symbol, file external://route/…,
 *                                                    parent lib::route, carries the DEFINES edge
 *
 * Every route and request existed twice with its edges SPLIT between the copies, so `impact` gave a
 * different answer depending on which copy resolution landed on. This is the root cause behind
 * ADR 0129/0130 and the reason the proven traversal rule could not ship.
 *
 * Third instance of the same assumption — `resolveSymbol` (ADR 0130) and the id-first branch before
 * it made it too. A name may contain `::`; only a lookup can tell a name from an id.
 */
describe('a route lives on one node', () => {
  let repo: string;

  const vaultRows = (sql: string): any[] => {
    // The helpers run the CLI; for direct vault reads, go through query --mode filter is not enough
    // here (we need ids), so use the CLI's own query template surface.
    const { stdout } = runCli(['query', '*', '--json', '--limit', '500'], { cwd: repo });
    return JSON.parse(stdout);
  };

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('route-single');
    writeFile(repo, 'api/server.ts',
      "import express from 'express';\n" +
      "const app = express();\n" +
      "app.get('/users/profile', (req, res) => { res.json({ ok: true }); });\n");
    writeFile(repo, 'web/client.ts',
      'export async function loadProfile() {\n' +
      "  const r = await fetch('/users/profile');\n" +
      '  return r.json();\n' +
      '}\n');
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 300000);

  afterAll(() => rmRepo(repo));

  it('does not mint a bare duplicate or a fake route library', () => {
    const rows = vaultRows('*');
    // The fake library namespace induced from the misread name.
    const fakeLibs = rows.filter((r: any) => String(r.filePath ?? '').startsWith('external://route')
      || String(r.filePath ?? '').startsWith('external://request'));
    expect(fakeLibs).toEqual([]);
  }, 120000);

  it('impact on the route names its REQUEST as the nearest dependent', () => {
    const { stdout } = runCli(['impact', 'ROUTE::/users/profile::GET', '--json'], { cwd: repo, allowFail: true });
    const j = JSON.parse(stdout);
    const names = (j.affectedNodes ?? []).map((n: any) => n.name);
    expect(names).toContain('REQUEST::/users/profile::GET');
    // The resolved id is a real, file-scoped node — not the bare string, not an external.
    expect(String(j.symbolId)).toContain('server.ts');
  }, 120000);
});
