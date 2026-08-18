import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * `entry` answers "what does this application SERVE". A client call is not a door.
 *
 * The express pattern `<object>.<verb>('<path>', …)` matches a route declaration and an HTTP client
 * call equally well, because they are the same shape. MEASURED on the orchestrator subject: 22 of
 * its 314 route entry points came from `scripts/qa/suites/*.mjs`, which drive the running app —
 * including one listed as the route `/api/experts/catalog?type=tutor`, and a server does not register
 * a query string.
 *
 * Two discriminators the grammar already has in hand, and no path heuristics:
 *   - a declaration passes a HANDLER, so a one-argument call is a request;
 *   - a handler is a FUNCTION, so a last argument that is an object/array/string literal is a payload.
 *
 * After both: the subject's real API routes stayed at 135, QA-script routes fell 22 → 3 (the residue
 * passes an identifier, which is shaped exactly like a named handler).
 */
describe('a served route is told apart from a client call', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('route-vs-request');

    writeFile(repo, 'package.json', JSON.stringify({ name: 'svc', type: 'module' }, null, 2));
    writeFile(repo, 'src/server.js', `
import express from 'express';
const app = express();

// SERVED: path plus handler.
app.get('/api/users', (req, res) => res.json([]));
app.post('/api/users', function create(req, res) { return res.json({}); });

export default app;
`);
    writeFile(repo, 'scripts/qa/drive.mjs', `
import { client } from './client.mjs';

const form = () => ({ name: 'x' });

// CALLED, not served: a QA script driving the running app.
export async function check() {
  const a = await client.get('/api/users');
  const b = await client.post('/api/users', { name: 'x' });
  // The hardest shape: two arguments, and the payload is a CALL — which is also what a middleware
  // factory looks like (\`app.get('/x', middleware())\`), so the argument cannot settle it.
  // Nobody AWAITS a route declaration; that is what settles it.
  const c = await client.post('/api/users', form());
  return [a, b, c];
}
`);
    writeFile(repo, 'scripts/qa/client.mjs', `
export const client = { get: async (u) => u, post: async (u, body) => ({ u, body }) };
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 180000);

  afterAll(() => rmRepo(repo));

  it('lists the served routes', () => {
    const entries = JSON.parse(runCli(['entry', '--json'], { cwd: repo }).stdout);
    const routes = entries.filter((e: any) => e.reason === 'route').map((e: any) => String(e.id));
    expect(routes.some(id => id.includes('server.js') && id.includes('/api/users'))).toBe(true);
  }, 180000);

  it('does not list a client call as a served route', () => {
    const entries = JSON.parse(runCli(['entry', '--json'], { cwd: repo }).stdout);
    const routes = entries.filter((e: any) => e.reason === 'route').map((e: any) => String(e.id));
    expect(routes.filter(id => id.includes('drive.mjs'))).toEqual([]);
  }, 180000);

  it('does not mistake an awaited call with a call-shaped payload for a route', () => {
    // MEASURED on the orchestrator subject: three QA-script calls survived the arity and
    // literal-payload rules because their payload is `form()`. After the await rule: real API routes
    // stayed at 135, QA-script routes went 22 -> 3 -> 0.
    const entries = JSON.parse(runCli(['entry', '--json'], { cwd: repo }).stdout);
    const routes = entries.filter((e: any) => e.reason === 'route').map((e: any) => String(e.id));
    expect(routes.some(id => id.includes('drive.mjs'))).toBe(false);
  }, 180000);
});

/**
 * Every other mode-taking command refuses an unknown mode and a mode missing its argument:
 * `status --mode banana` exits 1 naming the valid modes, `trace --mode banana` and
 * `trace --mode path` (no `--target`) both refuse, and `query --mode filter` refuses a missing
 * `--filter`. `query` was the outlier on its other two paths.
 *
 * MEASURED: `query X --mode banana` and `query X --mode template` (no `--template`) each printed an
 * ordinary fuzzy result set and exited 0 — the caller asked one question and was answered another,
 * with nothing to signal the substitution.
 */
describe('query refuses a mode it cannot honour', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('query-mode-refusal');
    writeFile(repo, 'src/main.ts', `export function findMe(): number { return 1; }\n`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 180000);

  afterAll(() => rmRepo(repo));

  it('refuses an unknown mode and names the valid ones', () => {
    const r = runCli(['query', 'findMe', '--mode', 'banana'], { cwd: repo, allowFail: true });
    expect(r.code).not.toBe(0);
    expect(r.combined).toMatch(/fuzzy/);
    expect(r.combined).toMatch(/template/);
  }, 180000);

  it('refuses template mode with no template id, instead of running a fuzzy search', () => {
    const r = runCli(['query', 'findMe', '--mode', 'template'], { cwd: repo, allowFail: true });
    expect(r.code).not.toBe(0);
    expect(r.combined).toMatch(/--template/);
  }, 180000);

  it('still answers an ordinary query', () => {
    // The counter-test: refusing everything would pass both cases above.
    expect(runCli(['query', 'findMe'], { cwd: repo }).stdout).toContain('findMe');
  }, 180000);
});
