import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * Cross-service HTTP binding (todo22#P15).
 *
 * This feature reported success and found nothing, on every project, for as long as it existed —
 * and it was broken in FOUR independent places at once, each of which alone was enough:
 *
 *   1. No grammar defined `@kinesis_route` or `@kinesis_request`, the captures the reflector
 *      branches on. Ten languages, zero definitions, so `processRoute`/`processRequest` were never
 *      called at all.
 *   2. `reflector.ts` ends with `spectrum.nodes = Array.from(nodeCache.values())`, which REPLACES
 *      the array — discarding every virtual node the flow processor had pushed into it.
 *   3. `addNode`'s skeleton did not keep `isRoute`/`isRequest`/`method`/`path`/`url`, and the
 *      fields lived only inside the `metadata` blob, so they did not survive a reload.
 *   4. `bindRouteCircuits` runs inside `resonate()`, AFTER the final wave flush, and
 *      `save({ metadataOnly: true })` writes no rows — so the edges it built were dropped.
 *
 * The test asserts the EDGE, because that is the only thing that proves all four are fixed. A
 * count of route nodes would have passed at step 3 while the feature still produced nothing.
 */
describe('Cross-service HTTP binding', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('crossservice');
    // Two services in one tree: an Express-style server and a client that fetches from it.
    writeFile(repo, 'api/server.ts', `
import express from 'express';
const app = express();
app.get('/users/profile', (req, res) => { res.json({ ok: true }); });
app.post('/users/create', (req, res) => { res.json({ id: 1 }); });
export default app;
`);
    writeFile(repo, 'web/client.ts', `
export async function loadProfile() {
  const r = await fetch('/users/profile');
  return r.json();
}
export async function createUser() {
  return fetch('/users/create');
}
`);
    commit(repo, 'two services');
    runCli(['analyze', '--force', '--yes'], { cwd: repo });
  });

  afterAll(() => rmRepo(repo));

  it('binds a fetch to the route it calls, and persists the edge', () => {
    const rows = JSON.parse(runCli(
      ['query', 'ROUTE::/users/profile::GET', '--mode', 'template', '--template', 'find_by_name', '--json'],
      { cwd: repo }).stdout);
    // The route node itself must exist — step 1 and 2 above.
    expect(rows.some((r: { name: string }) => r.name === 'ROUTE::/users/profile::GET')).toBe(true);

    // And the request must be bound to it. `impact` walks the persisted graph, so a result here
    // means the edge survived the pulse rather than living only in the process that built it.
    const { combined } = runCli(['impact', 'ROUTE::/users/profile::GET'], { cwd: repo });
    expect(combined).toContain('REQUEST::/users/profile');
  });

  it('does NOT bind a GET request to a POST route (proves matching is not vacuous)', () => {
    // `createUser` fetches /users/create with no method, so it is a GET; the route is a POST. A
    // binder that matched on URL alone would join them, which is why this case is here.
    const { combined } = runCli(['impact', 'ROUTE::/users/create::POST'], { cwd: repo });
    expect(combined).not.toContain('REQUEST::/users/create');
  });
});
