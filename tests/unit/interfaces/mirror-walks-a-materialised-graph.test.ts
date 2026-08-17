import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

/**
 * A mirror route that WALKS the graph must materialise it first (ADR 0038).
 *
 * The graph load is deferred, and `getAllNodes` REFUSES on an unmaterialised graph rather than
 * answering "nothing" — a guard that exists because answering nothing looks exactly like a clean
 * result. `/api/governance` called `registry.audit.audit()` without awaiting
 * `ensureGraphLoaded()`, so every request to the dashboard's governance panel answered HTTP 500
 * with the guard's own message. The panel had never rendered.
 *
 * This is the SAME defect ADR 0123 fixed in `audit --fallback`, in a second surface. The CLI path
 * was repaired and the web path was not, because nothing drives the web path — it was found on
 * 2026-08-17 by starting the mirror and asking it for the page.
 *
 * Checked statically because `MirrorServer` is not exported and booting express with a real vault
 * inside jest would test the harness more than the rule. What matters is the rule itself: a handler
 * that reaches a graph-walking registry method must await the load in the same handler.
 */
const SERVER = path.resolve('src/interfaces/web/mirror-server.ts');

/** Each `app.get('<route>', …)` handler body, split at the next route registration. */
const handlers = (): Array<{ route: string; body: string }> => {
  const src = fs.readFileSync(SERVER, 'utf8');
  const starts = [...src.matchAll(/this\.app\.get\(\s*'([^']+)'/g)];
  return starts.map((m, i) => ({
    route: m[1],
    body: src.slice(m.index!, i + 1 < starts.length ? starts[i + 1].index! : src.length),
  }));
};

/** Registry calls that reach `getAllNodes` and therefore need a materialised graph. */
const WALKS_THE_GRAPH = /registry\.audit\.audit\(|registry\.audit\.advise\(|graphEngine\.getGraph\(/;

describe('every mirror route that walks the graph materialises it first', () => {
  const routes = handlers();

  it('found the routes at all — a check over zero handlers is not a pass (ADR 0044)', () => {
    expect(routes.length).toBeGreaterThanOrEqual(5);
    expect(routes.map(r => r.route)).toEqual(expect.arrayContaining(['/api/governance', '/api/synapse']));
  });

  it('no handler reaches a graph walk without awaiting ensureGraphLoaded', () => {
    const offenders = routes
      .filter(r => WALKS_THE_GRAPH.test(r.body))
      .filter(r => !/ensureGraphLoaded\(\)/.test(r.body))
      .map(r => r.route);

    expect({ offenders }).toEqual({ offenders: [] });
  });

  it('and at least one handler actually walks, so the rule above is not vacuous', () => {
    // Without this, deleting the audit call from every route would make the check above pass while
    // scoring nothing — the empty-denominator shape this project has been caught by repeatedly.
    const walkers = routes.filter(r => WALKS_THE_GRAPH.test(r.body)).map(r => r.route);

    expect(walkers).toContain('/api/governance');
  });
});
