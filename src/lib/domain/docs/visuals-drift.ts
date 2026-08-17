import path from "node:path";

/**
 * Conducks — Visuals Drift Check 🖼️🔁
 *
 * `visuals-lint` proves the anchors a page CLAIMS still resolve. This proves the page itself was
 * re-drawn after the data it is generated from changed — the failure anchors cannot see: a stale
 * rendering can cite anchors that all still resolve while the picture no longer matches the data.
 *
 * conducks cannot know how a repo draws its pictures, so the repo declares its generator in
 * `conducks.json`: `{ "visuals": { "generate": "npm run visuals" } }`. The check is a re-render and
 * a byte comparison: snapshot `docs/visuals/`, run the declared command, diff, RESTORE. Read-only
 * from the caller's point of view — a failing check leaves the tree exactly as it found it, and the
 * fix is always the same one command: the declared generator, committed.
 *
 * No declaration → skipped, and the skip is reported, never silent (ADR 0124: a gate that checks
 * less than it appears to is worse than no gate).
 */

/** Every filesystem and process primitive the check needs, injected so the logic is testable. */
export interface DriftIO {
  /** All files under `dir`, recursive, as paths relative to `dir`. Missing dir → []. */
  listFiles(dir: string): string[];
  read(abs: string): Buffer | null;
  write(abs: string, data: Buffer): void;
  remove(abs: string): void;
  /** Run the generator at `cwd`. `ok: false` carries whatever it printed. */
  run(command: string, cwd: string): { ok: true } | { ok: false; output: string };
}

export type DriftResult =
  | { status: "skipped"; reason: string }
  | { status: "crashed"; output: string }
  | { status: "clean"; files: number }
  | { status: "drift"; files: string[] };

/**
 * Re-run the declared generator and report every file under `docs/visuals/` it would change.
 *
 * The originals are restored whatever happens — including files the generator CREATES (deleted
 * again) and files it DELETES (written back). The finally block is the contract; the comparison is
 * just bookkeeping around it.
 */
export function checkVisualsDrift(root: string, command: string, io: DriftIO): DriftResult {
  const base = path.join(root, "docs", "visuals");
  const relBefore = io.listFiles(base);
  if (relBefore.length === 0) return { status: "skipped", reason: "no files under docs/visuals" };

  const before = new Map<string, Buffer | null>();
  for (const rel of relBefore) before.set(rel, io.read(path.join(base, rel)));

  let crashed: string | null = null;
  const drifted = new Set<string>();
  try {
    const run = io.run(command, root);
    if (!run.ok) { crashed = run.output; return { status: "crashed", output: crashed }; }

    const relAfter = io.listFiles(base);
    for (const rel of new Set([...before.keys(), ...relAfter])) {
      const was = before.get(rel) ?? null;
      const now = relAfter.includes(rel) ? io.read(path.join(base, rel)) : null;
      const same = was !== null && now !== null ? was.equals(now) : was === now;
      if (!same) drifted.add(rel);
    }
  } finally {
    // Restore the committed state byte-for-byte: rewrite what existed, delete what appeared.
    for (const rel of io.listFiles(base)) if (!before.has(rel)) io.remove(path.join(base, rel));
    for (const [rel, data] of before) if (data !== null) io.write(path.join(base, rel), data);
  }

  return drifted.size > 0
    ? { status: "drift", files: [...drifted].sort().map(f => path.join("docs", "visuals", f)) }
    : { status: "clean", files: before.size };
}

/**
 * The declared generator command, or null. Reading the declaration is separate from running the
 * check so a caller can distinguish "repo has no opinion" from "check skipped" — the CLI reports
 * the first as a dim note and would report a failure to parse loudly.
 */
export function generatorCommandOf(conducksJsonText: string | null): string | null {
  if (conducksJsonText === null) return null;
  try {
    const parsed = JSON.parse(conducksJsonText);
    const cmd = parsed?.visuals?.generate;
    return typeof cmd === "string" && cmd.trim().length > 0 ? cmd : null;
  } catch {
    return null;
  }
}
