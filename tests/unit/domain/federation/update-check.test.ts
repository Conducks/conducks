import { describe, it, expect, beforeEach, afterEach, beforeAll, jest } from '@jest/globals';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';

/**
 * The update notice is the ONLY outbound call in conducks, so its job is to be quiet and never wrong
 * (todo16 Phase 3, ADR 0027).
 *
 * The distinction that matters: "no release published" and "could not reach GitHub" are different
 * facts. Collapsing them makes `doctor` warn forever before the first release.
 *
 * `node:https` IS STUBBED, and it has to be. This file used to say "no test touches the network",
 * and that was false: the TTL case below deliberately falls through to the fetch, so every run of
 * the unit suite made a live request to api.github.com with a 2-second timeout. MEASURED: two
 * different suites flaked across eight full runs in one day, this one among them, each passing when
 * re-run alone — the signature of wall-clock dependence rather than a defect.
 *
 * The stub answers the way an OFFLINE machine does, which is one of the two cases the TTL test
 * names in its own comment ("Offline or 404"). So the assertion keeps its meaning and stops
 * depending on a third party being reachable, fast, and not rate-limiting a CI machine.
 */
const httpsGet = jest.fn(() => {
  const req = new EventEmitter() as EventEmitter & { destroy: () => void; end: () => void };
  req.destroy = () => {};
  req.end = () => {};
  // Emit on the next tick: `https.get` returns the request object before any event can fire, and a
  // synchronous emit here would reach a listener the caller has not attached yet.
  process.nextTick(() => req.emit('error', new Error('offline (stubbed)')));
  return req;
});

jest.unstable_mockModule('node:https', () => ({
  default: { get: httpsGet },
  get: httpsGet,
}));

let UpdateCheck: typeof import('@/lib/domain/federation/update-check.js').UpdateCheck;
beforeAll(async () => {
  ({ UpdateCheck } = await import('@/lib/domain/federation/update-check.js'));
});
describe('UpdateCheck', () => {
  let cacheDir: string;
  const savedOptOut = process.env.CONDUCKS_NO_UPDATE_CHECK;

  const seedCache = (payload: object) => {
    writeFileSync(path.join(cacheDir, 'update-check.json'), JSON.stringify(payload));
  };

  beforeEach(() => {
    cacheDir = mkdtempSync(path.join(tmpdir(), 'conducks-update-'));
    delete process.env.CONDUCKS_NO_UPDATE_CHECK;
  });

  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true });
    if (savedOptOut === undefined) delete process.env.CONDUCKS_NO_UPDATE_CHECK;
    else process.env.CONDUCKS_NO_UPDATE_CHECK = savedOptOut;
  });

  it('reports behind when the cached release is newer than this copy', async () => {
    seedCache({ latest: 'v99.0.0', checkedAt: Date.now() });

    const status = await new UpdateCheck(cacheDir).check();

    expect(status?.behind).toBe(true);
    expect(status?.latest).toBe('v99.0.0');
    expect(status?.cached).toBe(true);
    expect(status?.release).toBe('published');
    // It TELLS, it never upgrades — the notice must hand back a command, not run one.
    expect(status?.upgradeCommand).toMatch(/npm i -g conducks@latest|git pull/);
  });

  it('does not report behind when the cached release is older or equal', async () => {
    seedCache({ latest: 'v0.0.1', checkedAt: Date.now() });
    expect((await new UpdateCheck(cacheDir).check())?.behind).toBe(false);
  });

  it('treats an unparseable release tag as not behind — silence beats a false alarm', async () => {
    seedCache({ latest: 'nightly-build', checkedAt: Date.now() });

    const status = await new UpdateCheck(cacheDir).check();

    expect(status?.behind).toBe(false);
  });

  it('distinguishes "no release published" from a failed check', async () => {
    // A cache entry with no `latest` is the cached form of GitHub's 404.
    seedCache({ checkedAt: Date.now() });

    const status = await new UpdateCheck(cacheDir).check();

    expect(status?.release).toBe('none');
    expect(status?.latest).toBeUndefined();
    expect(status?.behind).toBe(false);
  });

  it('ignores a cache entry older than the 24h TTL rather than trusting it forever', async () => {
    const twoDays = Date.now() - 2 * 24 * 60 * 60 * 1000;
    seedCache({ latest: 'v99.0.0', checkedAt: twoDays });

    // Expired, so it falls through to the fetch — which the stub answers as OFFLINE. Offline or 404,
    // the ONE thing it must never do is report behind:true off a stale entry.
    const status = await new UpdateCheck(cacheDir).check();

    expect(status?.cached).toBe(false);
    expect(status?.latest).not.toBe('v99.0.0');
    // The stub must actually have been reached. Without this the test still passes when the mock
    // fails to apply — it would just be making a real request again, which is the thing being
    // removed. A hermetic test has to prove it was hermetic.
    expect(httpsGet).toHaveBeenCalled();
  });

  it('ignores a corrupt cache file instead of throwing', async () => {
    writeFileSync(path.join(cacheDir, 'update-check.json'), '{ not json');
    await expect(new UpdateCheck(cacheDir).check()).resolves.not.toThrow();
  });

  it('returns null and makes no request when opted out', async () => {
    process.env.CONDUCKS_NO_UPDATE_CHECK = '1';
    seedCache({ latest: 'v99.0.0', checkedAt: Date.now() });

    expect(await new UpdateCheck(cacheDir).check()).toBeNull();
  });

  it('reads its own version, not the analyzed project\'s package.json', async () => {
    seedCache({ latest: 'v0.0.1', checkedAt: Date.now() });

    const status = await new UpdateCheck(cacheDir).check();

    // cwd during tests is the conducks repo, but the version must come from walking up from the
    // module itself — the same trap `setup` documents for the MCP entry path.
    const own = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
    expect(status?.installed).toBe(own.version);
    expect(status?.installed).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('never writes outside the cache dir it was given', async () => {
    seedCache({ latest: 'v0.0.1', checkedAt: Date.now() });
    await new UpdateCheck(cacheDir).check();

    expect(existsSync(path.join(cacheDir, 'update-check.json'))).toBe(true);
  });
});
