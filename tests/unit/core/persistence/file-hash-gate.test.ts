import { describe, it, expect, beforeEach } from '@jest/globals';
import { FileHashGate } from '@/lib/core/persistence/file-hash-gate.js';
import type { SynapsePersistence } from '@/lib/core/persistence/persistence.js';

/**
 * The hash gate decides whether a save is worth parsing (todo17 Phase 1, ADR 0030).
 *
 * The invariant that matters is the DIRECTION of its failures: every unknown must resolve to
 * "changed". A gate that wrongly says "unchanged" leaves the graph silently stale, which is the exact
 * failure conducks exists to prevent; a gate that wrongly says "changed" costs one parse. So the
 * unreadable-vault and unknown-file cases are tested as hard requirements, not edge cases.
 */
describe('FileHashGate', () => {
  /** Minimal stand-in for the vault. Counts reads so the in-process cache can be observed. */
  class FakeVault {
    public hashes = new Map<string, string>();
    public reads = 0;
    public writes: Array<{ file: string; hash: string; size: number }> = [];
    public throwOnRead = false;
    public throwOnWrite = false;

    async getFileHash(file: string): Promise<string | undefined> {
      this.reads++;
      if (this.throwOnRead) throw new Error('vault locked');
      return this.hashes.get(file);
    }
    async setFileHash(file: string, hash: string, sizeBytes: number): Promise<void> {
      if (this.throwOnWrite) throw new Error('read-only');
      this.hashes.set(file, hash);
      this.writes.push({ file, hash, size: sizeBytes });
    }
    async forgetFileHash(file: string): Promise<void> { this.hashes.delete(file); }
  }

  let vault: FakeVault;
  let gate: FileHashGate;
  const FILE = '/repo/src/a.ts';

  beforeEach(() => {
    vault = new FakeVault();
    gate = new FileHashGate(vault as unknown as SynapsePersistence);
  });

  it('treats a file it has never seen as changed', async () => {
    expect(await gate.hasChanged(FILE, 'export const a = 1;')).toBe(true);
  });

  it('dismisses identical content once recorded', async () => {
    const source = 'export const a = 1;';
    await gate.record(FILE, source);

    expect(await gate.hasChanged(FILE, source)).toBe(false);
  });

  it('reports a change for content that differs by one byte', async () => {
    await gate.record(FILE, 'export const a = 1;');
    expect(await gate.hasChanged(FILE, 'export const a = 2;')).toBe(true);
  });

  it('reports a change for whitespace only — line numbers move even when symbols do not', async () => {
    await gate.record(FILE, 'export const a = 1;');
    expect(await gate.hasChanged(FILE, '\nexport const a = 1;')).toBe(true);
  });

  it('answers from the process cache instead of re-querying the vault per save', async () => {
    const source = 'export const a = 1;';
    vault.hashes.set(FILE, FileHashGate.hash(source));

    await gate.hasChanged(FILE, source);
    await gate.hasChanged(FILE, source);
    await gate.hasChanged(FILE, source);

    expect(vault.reads).toBe(1);
  });

  it('says CHANGED when the vault cannot be read — never skips on an error', async () => {
    vault.throwOnRead = true;
    expect(await gate.hasChanged(FILE, 'anything')).toBe(true);
  });

  it('does not throw when the vault is read-only, and still gates within the process', async () => {
    vault.throwOnWrite = true;
    const source = 'export const a = 1;';

    await expect(gate.record(FILE, source)).resolves.toBeUndefined();
    // The write failed, but the in-process cache still holds it — a watcher on a read-only vault
    // gets the benefit for its own lifetime.
    expect(await gate.hasChanged(FILE, source)).toBe(false);
  });

  it('matches paths case-insensitively, as ids and paths are lowercase-normalised', async () => {
    const source = 'export const a = 1;';
    await gate.record('/Repo/Src/A.ts', source);

    expect(await gate.hasChanged('/repo/src/a.ts', source)).toBe(false);
    expect(vault.writes[0].file).toBe('/repo/src/a.ts');
  });

  it('re-parses after forget, so a purge cannot leave a file permanently skipped', async () => {
    const source = 'export const a = 1;';
    await gate.record(FILE, source);
    await gate.forget(FILE);

    expect(await gate.hasChanged(FILE, source)).toBe(true);
  });

  it('records the byte length, not the character count', async () => {
    await gate.record(FILE, 'const emoji = "🛡️";');
    expect(vault.writes[0].size).toBe(Buffer.byteLength('const emoji = "🛡️";'));
  });

  it('hashes content only — the same bytes at a different path hash identically', () => {
    expect(FileHashGate.hash('same')).toBe(FileHashGate.hash('same'));
    expect(FileHashGate.hash('same')).toHaveLength(64);
  });
});
