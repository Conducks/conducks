/**
 * Conducks — Analyze Scope Guard 🛑
 *
 * `conducks analyze <path>` took any path at all. One typo — `conducks analyze ~/Documents` — starts
 * a full pulse over every repo, dependency tree and photo library under it, writes a `.conducks`
 * vault into a folder that is not a project, and takes hours doing it.
 *
 * Nothing is FORBIDDEN: if you really mean it, you can always get there. The guard scales how hard
 * it is to do by accident — `ask` for a root that merely looks odd, `ask-twice` (confirm, then type
 * the folder name) for the ones that are almost always a mistake.
 *
 * This is a PURE assessment: it reports a level and reasons and never prompts, so the same rule
 * gates the CLI (ask), a non-interactive caller (refuse — nobody is there to answer) and the tests.
 *
 * The bar is "does this look like ONE project", not "is this big". A 40k-file monorepo with a `.git`
 * at its root is exactly what conducks is for; `~/Documents` with 40k files is not.
 */
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import os from "node:os";

/** Any one of these at the root means a human deliberately made this a project. */
const PROJECT_MARKERS = [
  ".git", "package.json", "go.mod", "pyproject.toml", "setup.py", "Cargo.toml",
  "pom.xml", "build.gradle", "build.gradle.kts", "composer.json", "Gemfile", "tsconfig.json",
  "requirements.txt", ".conducks", "CMakeLists.txt", "Makefile", "*.sln", "*.csproj",
  "Package.swift", "mix.exs", "deno.json", "pubspec.yaml", "Cargo.lock", ".conducksignore",
];

/**
 * Roots that are almost never a project: OS trees, the home directory and everything users keep
 * directly under it, cloud-sync folders (analyzing one re-uploads whatever is written), and the
 * folders people habitually park many repos in.
 */
function criticalRoots(): string[] {
  const home = os.homedir();
  const system = [
    "/", "/Users", "/home", "/root",
    "/tmp", "/private", "/private/tmp", "/var", "/private/var", "/etc", "/dev", "/proc",
    "/usr", "/usr/local", "/usr/bin", "/bin", "/sbin", "/opt", "/opt/homebrew",
    "/System", "/Library", "/Applications", "/Volumes", "/Network", "/cores",
    "C:\\", "C:\\Windows", "C:\\Program Files", "C:\\Program Files (x86)", "C:\\Users",
  ];
  const underHome = [
    "", "Desktop", "Documents", "Downloads", "Library", "Movies", "Music", "Pictures",
    "Public", "Applications", "Sites", ".Trash", ".cache", ".config", ".local", ".ssh",
    // where people park many repos
    "Projects", "projects", "Developer", "dev", "Dev", "src", "Code", "code", "repos",
    "Repos", "workspace", "Workspace", "git", "GitHub", "work",
    // cloud sync — a pulse here re-uploads everything it writes
    "Dropbox", "Google Drive", "GoogleDrive", "OneDrive", "iCloud Drive", "Nextcloud",
    "Sync", "Creative Cloud Files", "Library/Mobile Documents", "Library/CloudStorage",
    // language/tool caches
    ".npm", ".nvm", ".cargo", ".rustup", ".gradle", ".m2", ".pyenv", ".docker", "go",
  ].map(d => (d ? path.join(home, d) : home));
  return [...system, ...underHome].map(p => path.resolve(p));
}

/** Directory NAMES that are never a project root, wherever they appear in the tree. */
const CRITICAL_BASENAMES = new Set([
  "node_modules", ".git", "vendor", "dist", "build", "out", "target", "coverage",
  ".venv", "venv", "env", "site-packages", "Pods", ".next", ".nuxt", ".cache",
  ".terraform", "bower_components", "__pycache__", ".gradle", ".idea", ".vscode",
]);

export type ScopeLevel = "ok" | "ask" | "ask-twice";

export interface ScopeAssessment {
  root: string;
  level: ScopeLevel;
  /** Convenience for callers that only care whether to stop and think. */
  risky: boolean;
  reasons: string[];
  /** Counted up to the cap only — the walk stops early on purpose. */
  approxFiles: number;
  cappedAt: number | null;
  /** How many immediate children look like projects in their own right. */
  childProjects: number;
}

export function assessRoot(root: string, fileCap = 25_000): ScopeAssessment {
  const resolved = path.resolve(root);
  const reasons: string[] = [];
  let level: ScopeLevel = "ok";
  const raise = (to: ScopeLevel, why: string) => {
    reasons.push(why);
    if (to === "ask-twice" || level === "ok") level = to === "ask-twice" ? "ask-twice" : (level === "ask-twice" ? level : to);
  };

  let isDir = false;
  try { isDir = statSync(resolved).isDirectory(); } catch { /* handled below */ }
  if (!isDir) {
    return { root: resolved, level: "ask-twice", risky: true, reasons: ["path does not exist or is not a directory"], approxFiles: 0, cappedAt: null, childProjects: 0 };
  }

  if (criticalRoots().includes(resolved))
    raise("ask-twice", `\`${resolved}\` is a system, home-level, cloud-sync or repo-parking directory — almost never one project`);

  if (CRITICAL_BASENAMES.has(path.basename(resolved)))
    raise("ask-twice", `\`${path.basename(resolved)}/\` is a dependency, build or tooling directory, not source you author`);

  const markers = presentMarkers(resolved);
  if (!markers.length)
    raise("ask", "no project marker at the root (no .git, package.json, go.mod, pyproject.toml, …) — this does not look like one project");

  // A folder holding several projects is a workspace, and pulsing it merges them into one graph.
  // This catches the parked-repos case no hardcoded list can know about.
  const childProjects = countChildProjects(resolved);
  if (childProjects >= 3 && !markers.length)
    raise("ask-twice", `${childProjects} of its subfolders are projects in their own right — this is a folder OF projects, and one pulse would merge them into a single graph`);

  const { count, capped } = countFiles(resolved, fileCap);
  if (capped)
    raise("ask", `over ${fileCap.toLocaleString()} files — a pulse this size takes a long time and is rarely what was meant`);

  return { root: resolved, level, risky: level !== "ok", reasons, approxFiles: count, cappedAt: capped ? fileCap : null, childProjects };
}

function presentMarkers(root: string): string[] {
  let entries: string[];
  try { entries = readdirSync(root); } catch { return []; }
  const set = new Set(entries);
  return PROJECT_MARKERS.filter(m => m.startsWith("*.")
    ? entries.some(e => e.endsWith(m.slice(1)))
    : set.has(m));
}

function countChildProjects(root: string): number {
  let entries: string[];
  try { entries = readdirSync(root); } catch { return 0; }
  let n = 0;
  for (const e of entries) {
    if (e.startsWith(".")) continue;
    const fp = path.join(root, e);
    try { if (!statSync(fp).isDirectory()) continue; } catch { continue; }
    if (presentMarkers(fp).length) n++;
    if (n >= 3) break;                       // enough to answer the question
  }
  return n;
}

/**
 * Depth-first count that stops the moment it passes the cap — the answer "more than 25,000" is all
 * the guard needs, and walking a home directory for an exact number is the very cost being avoided.
 */
function countFiles(root: string, cap: number): { count: number; capped: boolean } {
  let count = 0;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: string[];
    try { entries = readdirSync(dir); } catch { continue; }
    for (const e of entries) {
      if (e.startsWith(".") || CRITICAL_BASENAMES.has(e)) continue;
      const fp = path.join(dir, e);
      let st;
      try { st = statSync(fp); } catch { continue; }
      if (st.isDirectory()) stack.push(fp);
      else if (++count > cap) return { count, capped: true };
    }
  }
  return { count, capped: false };
}

/** One block of human-readable text for the CLI prompt or a non-interactive refusal. */
export function explainScope(a: ScopeAssessment): string {
  const lines = [
    `Target: ${a.root}`,
    `Files (excluding dot-dirs, node_modules and build output): ${a.approxFiles}${a.cappedAt ? "+ (stopped counting)" : ""}`,
  ];
  for (const r of a.reasons) lines.push(`  • ${r}`);
  return lines.join("\n");
}
