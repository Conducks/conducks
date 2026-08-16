import chalk from "chalk";

/**
 * Say when the answer describes files that have since changed.
 *
 * `status` learned to compare the working tree against what the vault analyzed; the commands that
 * ANSWER questions did not ask. So `impact` and `prune` would state a confident result about a graph
 * built before the edit that prompted the question — the exact case that started this: deleting a
 * call and being told the caller still exists.
 *
 * A WARNING, never a refusal, and never a change to the answer itself:
 *   - ADR 0036 makes a daemon an accelerator and never a requirement, so a command must still answer
 *     with nothing running and no recent pulse;
 *   - refusing would break every CI use, where the vault is built once and read many times;
 *   - `added` is excluded from the verdict already (`isStale`), because `analyze` is incremental by
 *     mtime and files older than the last pulse legitimately carry no hash.
 *
 * WHAT IT COSTS, measured rather than waved at: it hashes every discovered file. On the largest
 * subject `prune` went from 1.81s to 2.59s — +0.78s, about 43% — and on a 400-file generated project
 * `impact` went from 0.40s to 0.42s. Kept without a flag to switch it off: `prune`'s whole job is
 * "is it safe to delete this", and an answer from before the edit is the expensive thing, not the
 * second it takes to notice.
 *
 * Written to STDERR so `--json` stays machine-parseable — the export oracle reads `prune --json`,
 * and a warning on stdout would break it.
 */
export async function warnIfStale(registry: { audit: { checkWorkingTree(): Promise<{ changed: number; removed: number; stale: boolean }> } }): Promise<void> {
  let fresh;
  try {
    fresh = await registry.audit.checkWorkingTree();
  } catch {
    return;   // a vault this cannot read is reported by the command's own error path
  }
  if (!fresh.stale) return;

  const parts = [
    fresh.changed > 0 ? `${fresh.changed} file(s) changed` : null,
    fresh.removed > 0 ? `${fresh.removed} gone` : null,
  ].filter(Boolean).join(', ');
  process.stderr.write(chalk.yellow(
    `[WARN] The graph is behind the working tree — ${parts} since the last pulse. ` +
    `This answer describes the code as it was analyzed. Run 'conducks analyze' to refresh.\n`));
}
