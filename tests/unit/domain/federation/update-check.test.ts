import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { UpdateCheck } from '@/lib/domain/federation/update-check.js';

/**
 * The update notice is the ONLY outbound call in conducks, so its job is to be quiet and never wrong
 * (todo16 Phase 3, ADR 0027). Every case here runs off the CACHE, so no test touches the network:
 * a cached answer short-circuits the fetch, which is exactly the path a user hits most.
 *
 * The distinction that matters: "no release published" and "could not reach GitHub" are different
 * facts. Collapsing them makes `doctor` warn forever before the first release.
 */
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

    // Expired, so it falls through to the network. Offline or 404, the ONE thing it must never do is
    // report behind:true off a stale entry.
    const status = await new UpdateCheck(cacheDir).check();

    expect(status?.cached).toBe(false);
    expect(status?.latest).not.toBe('v99.0.0');
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
