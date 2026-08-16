import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { SOURCE_EXTENSIONS } from "@/contracts/index.js";

/**
 * Conducks — what changed in the working tree, and which symbols those changes land on 🔍
 *
 * ONE implementation, because there were two and they disagreed. Measured on this repository on
 * 2026-08-09, same moment, same graph, 15 changed files in the tree:
 *
 *     conducks diff   (CLI)  -> "Analyzed 15 hunks. 7 symbols impacted."
 *     conducks_diff   (MCP)  -> {impactedSymbols: [], totalImpacted: 0}
 *
 * The CLI had been fixed twice — ADR 0122 for staged changes (`git diff` alone shows UNSTAGED only)
 * and again on 2026-08-08 for untracked files (`git diff HEAD` cannot see a file git does not track).
 * The MCP tool held a private copy that received neither fix, and carried a third bug of its own: it
 * ended each symbol at `lineStart + (complexity || 1)`. `complexity` is a cyclomatic count, not a
 * line span, so a function spanning lines 10..90 was treated as ending at line 11 and a change
 * anywhere inside it matched nothing.
 *
 * Three ways to be blind, in the one place whose whole job is answering "what did I just put at
 * risk". A change set is not "what `git diff` prints" — it is tracked-and-staged, tracked-and-not,
 * and not-tracked-at-all, and a reading that omits any of the three is silence dressed as a clean
 * bill of health.
 */

export interface FileChange {
  /** Absolute, lower-cased — matched against `node.properties.filePath`, which is stored the same way. */
  file: string;
  /** Every line the change touched. */
  lines: number[];
}

/**
 * Hunks out of a `-U0` diff.
 *
 * Throws on a path escaping the root (S9) rather than exiting: this is domain code and a process
 * that dies inside a library cannot be handled by the surface that called it.
 */
export function parseDiffHunks(diff: string, cwd: string): FileChange[] {
  const root = path.resolve(cwd);
  const changes: FileChange[] = [];
  let currentFile = '';

  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) {
      const userPath = line.replace('+++ b/', '');
      const resolved = path.resolve(root, userPath);
      if (!resolved.startsWith(root + path.sep) && resolved !== root) {
        throw new Error(`path '${userPath}' is outside repository root`);
      }
      currentFile = resolved.toLowerCase();
      changes.push({ file: currentFile, lines: [] });
    } else if (line.startsWith('@@')) {
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
      if (match && currentFile) {
        const start = parseInt(match[1], 10);
        const count = parseInt(match[2] || '1', 10);
        const last = changes[changes.length - 1];
        for (let i = 0; i < count; i++) last.lines.push(start + i);
      }
    }
  }
  return changes.filter(c => c.lines.length > 0);
}

/**
 * Files git does not track — invisible to `git diff HEAD`, and entirely new, so every line counts.
 *
 * Filtered to SOURCE_EXTENSIONS because the untracked set otherwise includes the `.conducks` vault
 * itself and a clean tree reports changes.
 */
export function untrackedChanges(cwd: string): FileChange[] {
  try {
    const out = execSync('git ls-files --others --exclude-standard', { encoding: 'utf-8', cwd });
    const root = path.resolve(cwd);
    return out.split('\n')
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => path.resolve(root, p))
      .filter(abs => abs.startsWith(root + path.sep))
      .filter(abs => SOURCE_EXTENSIONS.has(path.extname(abs)))
      .filter(abs => { try { return fs.statSync(abs).isFile(); } catch { return false; } })
      .map(abs => {
        let lineCount = 1;
        try { lineCount = fs.readFileSync(abs, 'utf-8').split('\n').length; } catch { /* unreadable: one line */ }
        return { file: abs.toLowerCase(), lines: Array.from({ length: lineCount }, (_, i) => i + 1) };
      });
  } catch {
    return [];
  }
}

/**
 * The whole change set: staged, unstaged and untracked.
 *
 * `git diff -U0 HEAD` rather than the bare form, so a fully `git add`-ed change set is not reported
 * as an empty one. Before the first commit there is no HEAD to diff against, so the worktree form is
 * the fallback — reporting "not a git repository" there would be a wrong diagnosis.
 *
 * Returns `null` when git itself is unavailable, which the caller must distinguish from an empty
 * change set: "git could not answer" and "nothing changed" are different facts.
 */
export function collectChanges(cwd: string): FileChange[] | null {
  let diff = "";
  try {
    diff = execSync('git diff -U0 HEAD', { encoding: 'utf-8', cwd });
  } catch {
    try {
      diff = execSync('git diff -U0', { encoding: 'utf-8', cwd });
    } catch {
      return null;
    }
  }
  return [...parseDiffHunks(diff, cwd), ...untrackedChanges(cwd)];
}

/**
 * Which indexed symbols the change set lands on.
 *
 * A symbol is hit when a changed line falls inside its RECORDED range. A node with no range is
 * skipped — the previous MCP copy synthesised an end line from `complexity` instead, which is how a
 * change in the middle of an 80-line function matched nothing at all.
 *
 * File equality is exact, never a suffix: `endsWith('/src/a.ts')` also matches
 * `/repo/vendor/src/a.ts`, and attributing a change to the wrong file is worse than missing it.
 */
export function impactedSymbolIds(
  nodes: Iterable<{ id: string; properties?: { filePath?: string; range?: { start?: { line?: number }; end?: { line?: number } } } }>,
  changes: FileChange[],
): string[] {
  const all = Array.from(nodes);
  const impacted = new Set<string>();

  for (const change of changes) {
    const inFile = all.filter(n => n.properties?.filePath === change.file);
    for (const line of change.lines) {
      const hit = inFile.find(n => {
        const start = n.properties?.range?.start?.line;
        const end = n.properties?.range?.end?.line;
        return typeof start === 'number' && typeof end === 'number' && line >= start && line <= end;
      });
      if (hit) impacted.add(hit.id);
    }
  }
  return [...impacted];
}
