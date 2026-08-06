// Keep the globally installed skills current with the source that was just built.
//
// `conducks setup` is pull: skills refresh only when someone re-runs it, so an edit to
// src/resources/skills/ silently leaves ~/.claude/skills serving the previous generation —
// guidance from an older version that reads as current (CONDUCKS-15). This closes the loop:
// every build re-syncs, so the installed copy can never lag the code it describes.
//
// Deliberately conditional: it syncs ONLY where a conducks skill is already installed. A machine
// that never opted in (CI runners, a fresh checkout) is not written to — installing is setup's
// job; this only keeps an existing install fresh.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const globalSkills = path.join(homedir(), ".claude", "skills");
if (!existsSync(globalSkills)) process.exit(0);

const { ConducksInstaller } = await import(
  path.join(root, "build", "src", "lib", "domain", "federation", "conducks-installer.js")
);
const installer = new ConducksInstaller(root);
if (!installer.isInstalled("global")) process.exit(0);

for (const report of await installer.sync()) {
  if (report.scope !== "global") continue;
  const bits = [
    report.created.length ? `${report.created.length} added` : "",
    report.updated.length ? `${report.updated.length} updated` : "",
    report.unchanged.length ? `${report.unchanged.length} current` : "",
    report.retired.length ? `${report.retired.length} retired` : "",
  ].filter(Boolean).join(", ");
  console.log(`[postbuild] skills (global) → ${report.dir}: ${bits}`);
}
