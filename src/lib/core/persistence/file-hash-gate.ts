import crypto from "node:crypto";
import type { SynapsePersistence } from "./persistence.js";

/**
 * Conducks — File Hash Gate
 *
 * One string comparison standing in front of every incremental re-parse (todo17 Phase 1).
 *
 * An editor writes a file on every autosave, a formatter rewrites it on focus loss, and a branch
 * switch touches hundreds at once — most of those events carry content that is byte-identical to what
 * the graph already holds. Parsing them costs the same as parsing a real edit. This answers "is this
 * actually different" from the vault, before a grammar is loaded or a tree is built.
 *
 * It gates WORK, never CORRECTNESS: a miss (no stored hash, unreadable vault, cache not warmed) always
 * falls through to "changed", so the worst case is the behaviour that existed before this class. That
 * asymmetry is deliberate — a wrongly skipped file is a silently stale graph, which is the failure mode
 * conducks exists to prevent.
 */
export class FileHashGate {
  /**
   * Hashes seen this process. The watcher is long-lived and hits the same handful of files repeatedly,
   * so re-querying DuckDB per save would put a database round-trip back in front of the comparison
   * this class exists to make cheap.
   */
  private cache = new Map<string, string>();

  /** Reads and writes hashes through the vault; holds no state of its own between calls. */
  constructor(private readonly persistence: SynapsePersistence) {}

  /** SHA-256 of the exact bytes on disk. Content only — no path, no mtime. */
  public static hash(source: string): string {
    return crypto.createHash("sha256").update(source).digest("hex");
  }

  /**
   * True when this content differs from what was last analyzed for this path, or when the answer is
   * unknown. `false` — and only `false` — means the re-parse can be skipped.
   */
  public async hasChanged(absPath: string, source: string): Promise<boolean> {
    const key = absPath.toLowerCase();
    const incoming = FileHashGate.hash(source);

    const cached = this.cache.get(key);
    if (cached !== undefined) return cached !== incoming;

    try {
      const stored = await this.persistence.getFileHash(key);
      if (stored === undefined) return true;          // never analyzed
      this.cache.set(key, stored);
      return stored !== incoming;
    } catch {
      return true;                                     // unknown → do the work
    }
  }

  /**
   * Records the content that was just analyzed. Call this AFTER the parse succeeds — recording first
   * would make a crashed parse look complete and leave those nodes permanently missing.
   */
  public async record(absPath: string, source: string): Promise<void> {
    const key = absPath.toLowerCase();
    const hash = FileHashGate.hash(source);
    this.cache.set(key, hash);
    try {
      await this.persistence.setFileHash(key, hash, Buffer.byteLength(source));
    } catch {
      // A hash that could not be stored costs one redundant parse later. Never fail the caller for it.
    }
  }

  /** Forgets a path so the next event re-parses it — for a delete, or a purge of its nodes. */
  public async forget(absPath: string): Promise<void> {
    const key = absPath.toLowerCase();
    this.cache.delete(key);
    try {
      await this.persistence.forgetFileHash(key);
    } catch { /* best effort */ }
  }
}
