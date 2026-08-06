import path from "node:path";
import fs from "node:fs";

/**
 * Conducks — Hook Installer 🪝
 *
 * `conducks setup` installed the CHECKS and no way to RUN them automatically, so every adopting
 * project hand-wrote the same pre-commit script slightly differently (todo46). This writes it once,
 * from the tool that owns the gates.
 *
 * The managed part lives between two markers, so re-running replaces exactly our block and never
 * touches what a project put around it. A foreign hook is APPENDED to, never replaced — someone
 * else's gate is not ours to delete. A symlinked hook is left entirely alone (the target belongs to
 * the repo's own tooling — sofie's does), with a printed instruction instead of a surprise edit.
 */

const OPEN = "# >>> conducks gates (managed by `conducks install-hooks` — edits inside are overwritten) >>>";
const CLOSE = "# <<< conducks gates <<<";

export type HookInstallResult =
  | { status: "created" | "updated" | "unchanged" | "appended"; hookPath: string }
  | { status: "skipped"; reason: string };

/**
 * The managed block. Both gates run only when something relevant is staged, so an unrelated commit
 * pays nothing; both skip LOUDLY when the CLI is missing — a missing tool must not block a commit,
 * and a skip that announces itself is honest where a silent pass would not be (todo46's own words).
 * The CLI path is recorded at install time; `install-hooks` re-run refreshes it.
 */
export function gateBlock(cliPath: string): string {
  return `${OPEN}
CONDUCKS_CLI="${cliPath}"
if [ -f "$CONDUCKS_CLI" ]; then
  conducks_staged=$(git diff --cached --name-only)
  case "$conducks_staged" in *docs/*)
    printf 'pre-commit: docs-lint … '
    if ! conducks_out=$(node "$CONDUCKS_CLI" docs-lint 2>&1); then
      printf '\\n%s\\n' "$conducks_out"; exit 1
    fi
    printf 'ok\\n';;
  esac
  if [ -d docs/visuals ]; then
    case "$conducks_staged" in *docs/visuals/*|*src/*|*scripts/*)
      printf 'pre-commit: visuals-lint … '
      if ! conducks_out=$(node "$CONDUCKS_CLI" visuals-lint . 2>&1); then
        printf '\\n%s\\n' "$conducks_out"; exit 1
      fi
      printf 'ok\\n';;
    esac
  fi
else
  printf 'pre-commit: conducks gates SKIPPED (CLI not found at %s)\\n' "$CONDUCKS_CLI"
fi
${CLOSE}`;
}

export function installHook(root: string, cliPath: string, force = false): HookInstallResult {
  const gitDir = path.join(root, ".git");
  // Not a git checkout (a tarball install, a worktree pointer file) → quietly nothing to do.
  if (!fs.existsSync(gitDir) || !fs.statSync(gitDir).isDirectory()) {
    return { status: "skipped", reason: "no .git directory — not a git checkout" };
  }
  const hooksDir = path.join(gitDir, "hooks");
  fs.mkdirSync(hooksDir, { recursive: true });
  const hookPath = path.join(hooksDir, "pre-commit");
  const block = gateBlock(cliPath);

  let existing: string | null = null;
  if (fs.existsSync(hookPath)) {
    if (fs.lstatSync(hookPath).isSymbolicLink()) {
      // The repo wired its own hook machinery; editing through the link would rewrite THEIR file.
      return { status: "skipped", reason: `pre-commit is a symlink (${fs.readlinkSync(hookPath)}) — the repo manages its own hook; add the gates there, or remove the link and re-run` };
    }
    existing = fs.readFileSync(hookPath, "utf8");
  }

  if (existing === null || force) {
    fs.writeFileSync(hookPath, `#!/bin/sh\n${block}\nexit 0\n`, { mode: 0o755 });
    return { status: existing === null ? "created" : "updated", hookPath };
  }

  const open = existing.indexOf(OPEN);
  const close = existing.indexOf(CLOSE);
  if (open !== -1 && close !== -1) {
    const next = existing.slice(0, open) + block + existing.slice(close + CLOSE.length);
    if (next === existing) return { status: "unchanged", hookPath };
    fs.writeFileSync(hookPath, next, { mode: 0o755 });
    return { status: "updated", hookPath };
  }

  // A foreign hook: their logic runs first and keeps its exit codes; ours adds the gates after.
  // A trailing `exit 0` would make an appended block dead code, so the block goes BEFORE it.
  const tail = existing.match(/\n(exit\s+0\s*)\n?$/);
  const next = tail
    ? existing.slice(0, tail.index) + "\n" + block + "\n" + tail[1] + "\n"
    : existing.replace(/\n?$/, "\n") + block + "\n";
  fs.writeFileSync(hookPath, next, { mode: 0o755 });
  return { status: "appended", hookPath };
}
