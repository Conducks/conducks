import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { installHook } from "@/lib/domain/federation/hook-installer.js";

/**
 * The hook installer (todo46): one command instead of a hand-written script per adopter. Each case
 * is a repo state the installer must not damage — the managed block is OURS, everything else is
 * somebody's.
 */

const CLI = "/opt/conducks/build/src/interfaces/cli/index.js";

let root: string;
beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), "hooks-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const gitInit = () => mkdirSync(path.join(root, ".git", "hooks"), { recursive: true });
const hookPath = () => path.join(root, ".git", "hooks", "pre-commit");

describe('installHook', () => {
  it('no .git → skipped quietly, nothing written (a tarball install must not fail)', () => {
    const r = installHook(root, CLI);
    expect(r.status).toBe("skipped");
    expect(existsSync(hookPath())).toBe(false);
  });

  it('fresh repo → creates an executable hook carrying both gates', () => {
    gitInit();
    const r = installHook(root, CLI);
    expect(r.status).toBe("created");
    const text = readFileSync(hookPath(), "utf8");
    expect(text).toContain("docs-lint");
    expect(text).toContain("visuals-lint");
    expect(text).toContain(CLI);
    expect(statSync(hookPath()).mode & 0o111).not.toBe(0);
  });

  it('re-running is idempotent — second run reports unchanged and the file is identical', () => {
    gitInit();
    installHook(root, CLI);
    const first = readFileSync(hookPath(), "utf8");
    const r = installHook(root, CLI);
    expect(r.status).toBe("unchanged");
    expect(readFileSync(hookPath(), "utf8")).toBe(first);
  });

  it('a changed CLI path refreshes only the managed block', () => {
    gitInit();
    installHook(root, CLI);
    const r = installHook(root, "/elsewhere/index.js");
    expect(r.status).toBe("updated");
    expect(readFileSync(hookPath(), "utf8")).toContain("/elsewhere/index.js");
  });

  it("a foreign hook is appended to, its own lines untouched — and BEFORE its trailing exit 0, or the gates are dead code", () => {
    gitInit();
    writeFileSync(hookPath(), "#!/bin/sh\necho their-gate\nexit 0\n", { mode: 0o755 });
    const r = installHook(root, CLI);
    expect(r.status).toBe("appended");
    const text = readFileSync(hookPath(), "utf8");
    expect(text).toContain("echo their-gate");
    expect(text.indexOf("docs-lint")).toBeLessThan(text.lastIndexOf("exit 0"));
  });

  it('a symlinked hook is LEFT ALONE — the target belongs to the repo, not to us', () => {
    gitInit();
    writeFileSync(path.join(root, "own-hook.sh"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    symlinkSync(path.join(root, "own-hook.sh"), hookPath());
    const r = installHook(root, CLI);
    expect(r.status).toBe("skipped");
    expect(readFileSync(path.join(root, "own-hook.sh"), "utf8")).not.toContain("docs-lint");
  });

  it('--force rewrites even a foreign hook wholesale — the explicit ask overrides the caution', () => {
    gitInit();
    writeFileSync(hookPath(), "#!/bin/sh\necho their-gate\n", { mode: 0o755 });
    const r = installHook(root, CLI, true);
    expect(r.status).toBe("updated");
    expect(readFileSync(hookPath(), "utf8")).not.toContain("their-gate");
  });
});
