import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, basename, resolve, isAbsolute, dirname } from 'path';
import { fileURLToPath } from 'url';

// NOTE: DOCS_ROOT removed in workspace isolation - using workspace paths instead

/**
 * Find git root by walking up the directory tree
 */
function findGitRoot(path: string): string | null {
  let current = resolve(path);
  for (let i = 0; i < 10; i++) { // safety limit
    if (existsSync(join(current, '.git'))) {
      return current;
    }
    const parent = resolve(current, '..');
    if (parent === current) break;
    current = parent;
  }
  return null;
}

interface ProjectStructure {
  projectName: string;
  projectRoot: string;
  subprojects: string[];
  rootHasGit: boolean;
  nestedGitDirs: string[];
  gitRoot: string | null;
}

interface InitResult {
  success: boolean;
  projectStructure: ProjectStructure;
  createdFolders: string[];
  createdRulesFiles: string[];
  errors?: string[];
}

/**
 * Detects project structure from workspace path
 */
function detectProjectStructure(startPath: string): ProjectStructure {
  // Find git root by walking up
  const gitRoot = findGitRoot(startPath);
  const rootHasGit = gitRoot !== null;

  // Resolve multi-repo root: ascend while parent has >=2 child git directories
  let current = startPath;
  const maxAscend = 3; // safety cap
  for (let i = 0; i < maxAscend; i++) {
    const parent = join(current, '..');
    const parentResolved = resolve(current, '..');
    if (parentResolved === current) break; // reached filesystem root
    let childGitDirs: string[] = [];
    try {
      const entries = readdirSync(parentResolved);
      for (const e of entries) {
        const full = join(parentResolved, e);
        try {
          const st = statSync(full);
          if (st.isDirectory() && existsSync(join(full, '.git'))) {
            childGitDirs.push(e);
          }
        } catch { /* ignore */ }
      }
    } catch { /* cannot read parent */ }
    if (childGitDirs.length >= 2) {
      current = parentResolved;
      break; // parent is multi-repo root
    }
  }

  const projectName = basename(current);
  const subprojects: string[] = [];
  let nestedGitDirs: string[] = [];

  try {
    const items = readdirSync(current);
    for (const item of items) {
      // Skip obvious non-project directories
      if (item === 'node_modules' || item === 'build' || item === 'dist' || item === 'out' || item === '__pycache__') {
        continue;
      }
      const itemPath = join(current, item);
      let stat: any;
      try {
        stat = statSync(itemPath);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;
      // Detect nested git repositories
      if (existsSync(join(itemPath, '.git'))) {
        nestedGitDirs.push(item);
      }
    }
  } catch (err) {
    console.error(`Failed to scan workspace for git: ${err}`);
  }

  // Decision matrix:
  // 1. Root has .git AND no nested .git => single project
  // 2. Root has .git AND nested .git dirs => treat as multi (ignore root .git)
  // 3. Root has NO .git AND nested .git dirs => multi project (these are subprojects)
  // 4. No .git anywhere => fallback to heuristic service detection; if none => single project

  if (rootHasGit && nestedGitDirs.length === 0) {
    // Single project
    subprojects.push(projectName);
  } else if (nestedGitDirs.length > 0) {
    // Multi project based on nested git repos
    subprojects.push(...nestedGitDirs);
  } else {
    // No git anywhere - fallback heuristic (previous logic)
    try {
      const items = readdirSync(current);
      for (const item of items) {
        if (item.startsWith('.') || item === 'node_modules' || item === 'build' || item === 'dist' || item === 'out' || item === '__pycache__') {
          continue;
        }
        const itemPath = join(current, item);
        let stat: any;
        try { stat = statSync(itemPath); } catch { continue; }
        if (!stat.isDirectory()) continue;
        const hasPackageJson = existsSync(join(itemPath, 'package.json'));
        const hasCargoToml = existsSync(join(itemPath, 'Cargo.toml'));
        const hasGoMod = existsSync(join(itemPath, 'go.mod'));
        const hasSetupPy = existsSync(join(itemPath, 'setup.py'));
        const hasSrcDir = existsSync(join(itemPath, 'src'));
        const hasLibDir = existsSync(join(itemPath, 'lib'));
        if (hasPackageJson || hasCargoToml || hasGoMod || hasSetupPy || hasSrcDir || hasLibDir) {
          subprojects.push(item);
        }
      }
    } catch (e) {
      console.error(`Fallback heuristic failed: ${e}`);
    }
    if (subprojects.length === 0) {
      subprojects.push(projectName);
    }
  }

  return {
    projectName,
    projectRoot: current,
    subprojects,
    rootHasGit,
    nestedGitDirs,
    gitRoot
  };
}

/**
 * Generate inline rules (shown in response, not stored)
 */
function generateInlineRules(): string {
  return `GROUPING: 2+ criteria match = same file
- User Journey (discovery/engagement/contribution/management)
- Complexity (low/medium/high)
- Team (frontend/backend/data/ml/infra)
- Change Frequency (stable/evolutionary/experimental)

SPLIT TRIGGERS: 50 tasks OR 20k chars OR 6 months OR 3+ teams

DOMAIN TYPES:
User Journeys: <entity>-discovery, <entity>-engagement, <entity>-information
Data: data-model-core, data-processing, data-storage, data-api
Media: media-basic, media-advanced, media-cdn
Infrastructure: system-deployment, system-monitoring, system-scalability
ML: ml-content-processing, ml-recommendations, ml-search
Integration: integration-third-party, integration-internal

VERSIONING: v1→v2→v3 (evolution), core+social (offshoot)`;
}

/**
 * Creates mirrored project structure in storage root
 */
export async function handleInitializeProjectStructure(args: {
  workspace_path: string;
  project_name?: string; // Optional override for project name
  auto_select?: boolean; // include all detected subprojects automatically
  include_subprojects?: string[]; // user-chosen subset
}): Promise<InitResult> {
  let { workspace_path, project_name, auto_select, include_subprojects } = args;
  const errors: string[] = [];
  const createdFolders: string[] = [];
  const createdRulesFiles: string[] = [];

  try {
    // Security: reject absolute paths
    if (isAbsolute(workspace_path)) {
      throw new Error('Absolute paths are not allowed for security reasons. Use relative paths like "." or "../project-name".');
    }
    // Security: reject upward traversal attempts
    if (workspace_path.includes('..')) {
      throw new Error('Upward path traversal (..) is not allowed. Provide only "." or a direct child folder name.');
    }

    // Resolve relative path from current working directory
    const resolvedPath = resolve(process.cwd(), workspace_path);
    // Detect project structure with ascent logic
    const structure = detectProjectStructure(resolvedPath);

    // Override project name if provided
    if (project_name) {
      structure.projectName = project_name;
    }

    // If multiple git subprojects detected and user has not chosen auto_select or provided include_subprojects, return selection prompt
    if (structure.subprojects.length > 1 && !auto_select && (!include_subprojects || include_subprojects.length === 0)) {
      return {
        success: true,
        projectStructure: structure,
        createdFolders: [],
        createdRulesFiles: [],
        errors: [`SELECTION REQUIRED: Detected subprojects = ${structure.subprojects.join(', ')} | Re-run with auto_select:true OR include_subprojects:[names]`]
      };
    }

    // Apply include_subprojects filter if provided
    if (include_subprojects && include_subprojects.length > 0) {
      structure.subprojects = structure.subprojects.filter(s => include_subprojects.includes(s));
    }

    // Create project root in storage root
    const defaultStorage = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'storage');
    const storageRoot = process.env.CONDUCKS_STORAGE_ROOT || defaultStorage;
    const projectPath = join(storageRoot, structure.projectName);
    if (!existsSync(projectPath)) {
      mkdirSync(projectPath, { recursive: true });
      createdFolders.push(structure.projectName);
    }

    // Create global jobs folder structure at storage root (not per-workspace)
    const jobsToDoPath = join(storageRoot, 'jobs', 'to-do');
    const jobsDonePath = join(storageRoot, 'jobs', 'done-to-do');

    if (!existsSync(jobsToDoPath)) {
      mkdirSync(jobsToDoPath, { recursive: true });
      createdFolders.push('jobs/to-do');
    }

    if (!existsSync(jobsDonePath)) {
      mkdirSync(jobsDonePath, { recursive: true });
      createdFolders.push('jobs/done-to-do');
    }

    // NOTE: No per-project to-do/done-to-do folders in new model.
    // Tasks will reside under jobs/job_<id>/tasks/ as individual markdown files.

    return {
      success: true,
      projectStructure: structure,
      createdFolders,
      createdRulesFiles,
      errors: errors.length > 0 ? errors : undefined
    };

  } catch (error) {
    errors.push(`Failed to initialize project structure: ${error}`);
    return {
      success: false,
      projectStructure: {
        projectName: project_name || 'unknown',
        projectRoot: workspace_path,
        subprojects: [],
        rootHasGit: false,
        nestedGitDirs: [],
        gitRoot: null
      },
      createdFolders,
      createdRulesFiles,
      errors
    };
  }
}

/**
 * Formats the result for MCP response (TOON style - minimal tokens)
 */
export function formatInitResult(result: InitResult): string {
  if (!result.success) {
    return `INIT FAILED | ${result.errors?.join(' | ')}`;
  }

  const rules = generateInlineRules();
  // Determine detection mode
  const rootHasGit = result.projectStructure.rootHasGit;
  let detectionMode: string;
  if (rootHasGit && result.projectStructure.subprojects.length === 1 && result.projectStructure.subprojects[0] === result.projectStructure.projectName) {
    detectionMode = 'single-project (root .git)';
  } else if (rootHasGit && result.projectStructure.subprojects.length > 1) {
    detectionMode = 'multi-project (nested .git repos)';
  } else if (!rootHasGit && result.projectStructure.subprojects.length > 1) {
    detectionMode = 'multi-project (no root .git, nested repos)';
  } else {
    detectionMode = 'heuristic (no .git)';
  }

  let output = `PROJECT INITIALIZED\n\n`;
  output += `Root: ${basename(result.projectStructure.projectRoot)} | Mode: ${detectionMode}\n`;
  output += `Project: ${result.projectStructure.projectName} | Subprojects: ${result.projectStructure.subprojects.join(', ')}\n\n`;

  // Architecture warnings & suggestions
  const nestedGit = result.projectStructure.nestedGitDirs;
  if (rootHasGit && nestedGit.length > 0) {
    output += `ARCHITECTURE WARNING\n`;
    output += `Nested repositories detected inside a git root: ${nestedGit.join(', ')}\n`;
    output += `This pattern increases fragmentation, duplicate tooling, and hidden coupling.\n`;
    output += `REMEDIATION OPTIONS:\n`;
    output += `1. Monorepo: Convert nested repos to packages/workspaces (npm/yarn/pnpm or language-specific tooling).\n`;
    output += `2. Submodules (if intentional): Document purpose; otherwise remove stray .git directories.\n`;
    output += `3. Merge Histories: Use 'git remote add' + 'git subtree add' or 'filter-repo' to consolidate history.\n`;
    output += `4. Boundary Docs: Create architecture.md describing bounded contexts to prevent accidental bleed.\n`;
    output += `ACTION SUGGESTION: Begin by auditing build configs & dependency overlap across nested repos.\n\n`;
  } else if (!rootHasGit && nestedGit.length > 0) {
    output += `ARCHITECTURE WARNING\n`;
    output += `Workspace has no root VCS but inner git repositories: ${nestedGit.join(', ')}\n`;
    output += `Risk: No unified versioning, fragmented change tracking, harder CI/CD.\n`;
    output += `REMEDIATION OPTIONS:\n`;
    output += `1. Initialize root git and treat nested repos as modules (remove inner .git).\n`;
    output += `2. Or formalize as multi-repo; move each to separate top-level clone and use tooling (e.g. nx, turborepo, polyrepo orchestration).\n`;
    output += `3. Establish a root CONTRIBUTING.md and CODEOWNERS to clarify boundaries.\n\n`;
  }

  output += `CREATED (${result.createdFolders.length} folders)\n`;
  for (const folder of result.createdFolders) {
    output += `${folder}\n`;
  }

  output += `\nORGANIZATION RULES\n`;
  output += `${rules}\n\n`;

  output += `NEXT: create_job → create_task (per job) → complete_job when all tasks done\n`;
  output += `Jobs now own tasks directly (jobs/job_<id>/tasks/) | Domain files deprecated`;

  return output;
}
