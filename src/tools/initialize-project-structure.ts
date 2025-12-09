import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, basename, resolve, isAbsolute, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadCONDUCKSWorkspace } from '../core/storage.js';
import { mcpLogger } from '../dashboard/logger.js';

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
  alreadyInitialized?: boolean;
  systemStatus?: {
    activeJobs: number;
    completedJobs: number;
  };
}

/**
 * Detects project structure from workspace path
 */
function detectProjectStructure(startPath: string): ProjectStructure {
  // Find git root by walking up
  const gitRoot = findGitRoot(startPath);
  const rootHasGit = gitRoot !== null;

  // Do not ascend to parent - stay within the provided workspace path
  let current = resolve(startPath);

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
    // Single project - subprojects list remains empty to indicate root-level tasks
    // subprojects.push(projectName); // REMOVED: Do not force subproject for single repo
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
    if (subprojects.length === 0 && !rootHasGit) {
      // Only push project name if it's NOT a git root (heuristic fallback)
      // If it IS a git root, we want empty subprojects to signal single-repo mode
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

  mcpLogger.logOperation('TOOL_START', {
    tool: 'initialize_project_structure',
    args: { workspace_path, project_name, auto_select, include_subprojects }
  });

  try {
    mcpLogger.logOperation('PATH_VALIDATION', {
      input_path: workspace_path,
      path_type: isAbsolute(workspace_path) ? 'absolute' : 'relative'
    });

    // Resolve workspace path: use absolute paths directly, resolve relative paths from workspace root
    let resolvedPath: string;

    if (isAbsolute(workspace_path)) {
      // Use absolute path directly
      resolvedPath = workspace_path;
      mcpLogger.logPathResolution('absolute_path', workspace_path, resolvedPath);
    } else {
      // Security: reject upward traversal attempts for relative paths
      mcpLogger.logValidation('workspace_path', workspace_path, !workspace_path.includes('..'), {
        check: 'upward_traversal_prevention',
        rule: 'No .. in relative paths'
      });

      if (workspace_path.includes('..')) {
        throw new Error('Upward path traversal (..) is not allowed in relative paths. Use "." or a direct child folder name, or provide an absolute path.');
      }

      // Resolve relative path from workspace root (configurable via env var)
      const workspaceRoot = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
      resolvedPath = resolve(workspaceRoot, workspace_path);

      mcpLogger.logPathResolution('relative_path_resolution', workspace_path, resolvedPath, {
        workspace_root: workspaceRoot,
        resolved_from: process.cwd()
      });
    }
    mcpLogger.logOperation('DETECTING_PROJECT_STRUCTURE', {
      resolved_path: resolvedPath,
      path_exists: existsSync(resolvedPath)
    });

    // Detect project structure with ascent logic
    const structure = detectProjectStructure(resolvedPath);

    mcpLogger.logStructureDetection('initialize_project_structure', resolvedPath, {
      subprojects: structure.subprojects,
      rootHasGit: structure.rootHasGit,
      gitRoot: structure.gitRoot || undefined
    });

    mcpLogger.logOperation('PROJECT_STRUCTURE_DETECTED', {
      detected_subprojects: structure.subprojects,
      nested_git_repos: structure.nestedGitDirs,
      detection_mode: structure.rootHasGit ?
        (structure.nestedGitDirs.length > 0 ? 'multi-git' : 'single-git') :
        (structure.nestedGitDirs.length > 0 ? 'multi-no-root-git' : 'heuristic')
    });

    // Override project name if provided
    if (project_name) {
      mcpLogger.logOperation('PROJECT_NAME_OVERRIDE', {
        original: structure.projectName,
        override: project_name
      });
      structure.projectName = project_name;
    }

    mcpLogger.logOperation('SUBPROJECT_FILTERING_DECISION', {
      subprojects_count: structure.subprojects.length,
      auto_select: !!auto_select,
      include_subprojects_provided: !!include_subprojects,
      include_subprojects_list: include_subprojects,
      needs_user_selection: structure.subprojects.length > 1 && !auto_select && (!include_subprojects || include_subprojects.length === 0)
    });

    // If multiple git subprojects detected and user has not chosen auto_select or provided include_subprojects, return selection prompt
    if (structure.subprojects.length > 1 && !auto_select && (!include_subprojects || include_subprojects.length === 0)) {
      mcpLogger.logOperation('USER_SELECTION_REQUIRED', {
        reason: 'multiple_detected_subprojects',
        detected: structure.subprojects,
        suggestion: 'Use auto_select:true OR include_subprojects:[names]'
      });
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
      const originalSubprojects = [...structure.subprojects];
      structure.subprojects = structure.subprojects.filter(s => include_subprojects.includes(s));

      mcpLogger.logOperation('SUBPROJECT_FILTER_APPLIED', {
        original_subprojects: originalSubprojects,
        filter_criteria: include_subprojects,
        filtered_subprojects: structure.subprojects,
        matched: structure.subprojects.length,
        filtered_out: originalSubprojects.filter(s => !include_subprojects.includes(s))
      });
    }

    // Create project root in storage root
    const defaultStorage = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'storage');
    const storageRoot = process.env.CONDUCKS_STORAGE_ROOT || defaultStorage;
    const projectPath = join(storageRoot, structure.projectName);

    // Create global jobs folder structure at storage root (not per-workspace)
    const jobsToDoPath = join(storageRoot, 'jobs', 'to-do');
    const jobsDonePath = join(storageRoot, 'jobs', 'done-to-do');

    // Check if already initialized
    const alreadyInitialized = existsSync(jobsToDoPath) && existsSync(jobsDonePath);

    if (alreadyInitialized) {
      // Return current status instead of re-initializing
      try {
        const storage = await loadCONDUCKSWorkspace(workspace_path);
        const activeJobs = storage.jobs.filter(j => {
          const total = j.tasks.length;
          const completed = j.tasks.filter((t: any) => t.status === 'completed').length;
          return completed < total || total === 0;
        }).length;
        const completedJobs = storage.jobs.filter(j =>
          j.tasks.length > 0 && j.tasks.every((t: any) => t.status === 'completed')
        ).length;

        return {
          success: true,
          projectStructure: structure,
          createdFolders: [],
          createdRulesFiles: [],
          alreadyInitialized: true,
          systemStatus: {
            activeJobs,
            completedJobs
          }
        };
      } catch (error) {
        // If we can't load workspace, continue with initialization
        console.error('Failed to load workspace status:', error);
      }
    }

    if (!existsSync(projectPath)) {
      mkdirSync(projectPath, { recursive: true });
      createdFolders.push(structure.projectName);
    }

    if (!existsSync(jobsToDoPath)) {
      mkdirSync(jobsToDoPath, { recursive: true });
      createdFolders.push('jobs/to-do');
    }

    if (!existsSync(jobsDonePath)) {
      mkdirSync(jobsDonePath, { recursive: true });
      createdFolders.push('jobs/done-to-do');
    }

    // NOTE: Create folder structure for each detected subproject
    // For each subproject, create: to-do, done-to-do, analysis, problem-solution folders
    const folders = ['to-do', 'done-to-do', 'analysis', 'problem-solution'];

    if (structure.subprojects.length === 0) {
      // Single repo mode: create folders directly in project root
      for (const folder of folders) {
        const folderPath = join(projectPath, folder);
        if (!existsSync(folderPath)) {
          mkdirSync(folderPath, { recursive: true });
          createdFolders.push(folder);
        }
      }
    } else {
      for (const subproject of structure.subprojects) {
        for (const folder of folders) {
          const subprojectFolderPath = join(projectPath, subproject, folder);
          if (!existsSync(subprojectFolderPath)) {
            mkdirSync(subprojectFolderPath, { recursive: true });
            createdFolders.push(`${subproject}/${folder}`);
          }
        }
      }
    }

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
    return `init_failed: "${result.errors?.join(' | ')}"`;
  }

  // If already initialized, show current status
  if (result.alreadyInitialized && result.systemStatus) {
    const isSingleRepo = result.projectStructure.rootHasGit && result.projectStructure.subprojects.length === 1 && result.projectStructure.subprojects[0] === result.projectStructure.projectName;
    const isMultiService = !result.projectStructure.rootHasGit && result.projectStructure.nestedGitDirs.length > 0;

    let output = `system_status:\n`;
    output += `  project: "${result.projectStructure.projectName}"\n`;
    output += `  subprojects[${result.projectStructure.subprojects.length}]: ${result.projectStructure.subprojects.join(', ')}\n`;
    output += `  jobs_active: ${result.systemStatus.activeJobs}\n`;
    output += `  jobs_completed: ${result.systemStatus.completedJobs}\n`;
    output += `  initialized: true\n`;
    output += `  workspace_type: ${isSingleRepo ? 'single_repo' : isMultiService ? 'multi_service' : 'heuristic'}\n`;
    output += `next_steps:\n`;

    if (isSingleRepo) {
      output += `  workflow_guide: "Before creating jobs, ask user about goals, objectives, and tasks"\n`;
      output += `  create_job: "Create job AFTER gathering user requirements"\n`;
      output += `  create_task: "Create task in workspace (no subproject parameter)"`;
    } else if (isMultiService) {
      const subs = result.projectStructure.subprojects.join(', ');
      output += `  detected_subprojects: "${subs}"\n`;
      output += `  workflow_guide: "Before creating jobs, ask user about goals, objectives, and tasks"\n`;
      output += `  create_job: "Create job AFTER gathering user requirements"\n`;
      output += `  create_task: "Create task with subproject: ${subs}"`;
    } else {
      output += `  workflow_guide: "Before creating jobs, ask user about goals, objectives, and tasks"\n`;
      output += `  create_job: "Create job AFTER gathering user requirements"`;
    }

    output += `\nagent_instructions:\n`;
    output += `  - "ASK user about job goals before calling create_job"\n`;
    output += `  - "ASK user about tasks before calling batch_create_tasks"\n`;
    output += `  - "OFFER to analyze codebase after creating tasks"`;

    return output;
  }

  const isSingleRepo = result.projectStructure.rootHasGit && result.projectStructure.subprojects.length === 0;
  const isMultiService = !result.projectStructure.rootHasGit && result.projectStructure.nestedGitDirs.length > 0;

  let output = `structure_initialized:\n`;
  output += `  project: "${result.projectStructure.projectName}"\n`;
  output += `  subprojects[${result.projectStructure.subprojects.length}]: ${result.projectStructure.subprojects.join(', ')}\n`;
  output += `  workspace_type: ${isSingleRepo ? 'single_repo' : isMultiService ? 'multi_service' : 'heuristic'}\n`;

  if (result.createdFolders.length > 0) {
    output += `  folders_created[${result.createdFolders.length}]:\n`;
    for (const folder of result.createdFolders) {
      output += `    - ${folder}\n`;
    }
  }

  // Provide workflow guidance based on structure
  output += `workflow_guide:\n`;

  if (isSingleRepo) {
    output += `  "Single repository workspace - tasks created directly in workspace"\n`;
    output += `  "Before creating jobs, ask user about goals, objectives, and tasks"\n`;
    output += `  create_job: "Create job AFTER gathering user requirements"\n`;
    output += `  create_task: "Create task (no subproject needed)"`;
  } else if (isMultiService) {
    const allSubs = result.projectStructure.subprojects.join(', ');
    output += `  "Multi-service workspace - tasks created in subprojects"\n`;
    output += `  detected_subprojects: "${allSubs}"\n`;
    output += `  "Before creating jobs, ask user about goals, objectives, and tasks"\n`;
    output += `  create_job: "Create job AFTER gathering user requirements"\n`;
    output += `  create_task: "Create task with subproject: ${allSubs}"`;
  } else {
    output += `  "Standard workspace structure detected"\n`;
    output += `  "Before creating jobs, ask user about goals, objectives, and tasks"\n`;
    output += `  create_job: "Create job AFTER gathering user requirements"`;
  }

  output += `\nagent_instructions:\n`;
  output += `  - "ASK user about job goals before calling create_job"\n`;
  output += `  - "ASK user about tasks before calling batch_create_tasks"\n`;
  output += `  - "OFFER to analyze codebase after creating tasks"`;

  // Add warnings if any
  const nestedGit = result.projectStructure.nestedGitDirs;
  const rootHasGit = result.projectStructure.rootHasGit;
  if (rootHasGit && nestedGit.length > 0) {
    output += `\n  warning: "nested_git_repos_detected - consider monorepo or formal multi-repo structure"`;
  } else if (!rootHasGit && nestedGit.length > 0) {
    output += `\n  info: "multi_repo_workspace - use subproject parameter for task creation"`;
  }

  return output;
}

import { Tool } from '../core/tool-registry.js';

export const initializeProjectStructureTool: Tool<any> = {
  name: "initialize_project_structure",
  description: "**STEP 1 (REQUIRED):** Initialize workspace and get system status. **MUST BE RUN BEFORE ANY OTHER TOOL.** Safe to call anytime to check status.",
  inputSchema: {
    type: "object",
    properties: {
      project_path: { type: "string", description: "Full absolute filesystem path to workspace root (REQUIRED for accurate structure detection). Example: '/Users/username/my-project' or '/home/user/project'" },
      project_name: { type: "string", description: "Optional: Override detected project name" },
      auto_select: { type: "boolean", description: "Optional: Automatically include all detected subprojects" },
      include_subprojects: { type: "array", items: { type: "string" }, description: "Optional: Filter to only include these specific subproject names if auto_select=false" }
    },
    required: ["project_path"]
  },
  handler: async (args: any) => {
    // Map MCP parameter name to handler parameter name
    const handlerArgs = {
      ...args,
      workspace_path: args.project_path
    };
    return handleInitializeProjectStructure(handlerArgs);
  },
  formatter: formatInitResult
};
