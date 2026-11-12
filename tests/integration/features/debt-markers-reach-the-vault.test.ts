import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { SynapsePersistence } from "@/lib/core/persistence/index.js";
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * TODO / FIXME markers are read from every comment and attached to the symbol that holds them, so
 * `advise` can weigh debt. NONE reached the vault (state-machine audit P-03-1, measured by the lead):
 * a file with a top-level TODO, one inside a function and a FIXME inside a method left no trace in
 * any vault table.
 *
 * Two breaks, one per half of the chain:
 *   - inside a body, the reflector looked the symbol up as `file::<scope>.<scope>` — the scope chain
 *     twice — so no node matched and the markers were dropped;
 *   - (see the assertions below for what the rest of the chain did with the one that survived).
 */
describe('debt markers reach the vault', () => {
  let repo: string;
  let markers: Record<string, string[] | null>;

  beforeAll(async () => {
    ensureBuild();
    repo = mkGitRepo('debt-markers');
    writeFile(repo, 'src/a.ts', [
      '// TODO: top-level marker',
      'export function run(x: number) {',
      '  // TODO: handle empty input',
      '  return x;',
      '}',
      'export class Widget {',
      '  go() {',
      '    // FIXME: method marker',
      '    return 1;',
      '  }',
      '}',
      'export function clean() { return 2; }',
      '',
    ].join('\n'));
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
    const vault = new SynapsePersistence(repo, true);
    const rows = await vault.query<{ id: string; m: string | null }>(
      "SELECT id, json_extract_string(metadata, '$.debtMarkers') AS m FROM nodes WHERE file LIKE '%/src/a.ts'"
    );
    await vault.close();
    markers = Object.fromEntries(rows.map(r => [r.id.split('::').pop()!, r.m ? JSON.parse(r.m) : null]));
  }, 180000);

  afterAll(() => rmRepo(repo));

  it('each marker lands on the symbol whose body holds it, and nowhere else', () => {
    expect(markers).toEqual({
      unit: ['TODO'],
      run: ['TODO'],
      widget: null,
      'widget.go': ['FIXME'],
      clean: null,
    });
  });
});
