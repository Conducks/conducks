import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { DOCS_ROOT } from '../core/config.js';

interface ProjectStructure {
  projectName: string;
  projectRoot: string;
  subprojects: string[];
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
function detectProjectStructure(workspacePath: string): ProjectStructure {
  const projectName = basename(workspacePath);
  const subprojects: string[] = [];
  
  try {
    const items = readdirSync(workspacePath);
    
    for (const item of items) {
      const itemPath = join(workspacePath, item);
      
      // Skip hidden files, node_modules, build artifacts
      if (item.startsWith('.') || item === 'node_modules' || item === 'build' || 
          item === 'dist' || item === 'out' || item === '__pycache__') {
        continue;
      }
      
      const stat = statSync(itemPath);
      
      if (stat.isDirectory()) {
        // Check if directory looks like a subproject/service
        // Indicators: has package.json, Cargo.toml, go.mod, setup.py, or src/lib/tests folders
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
    }
  } catch (error) {
    // If can't read directory, treat as single-project workspace
    console.error(`Failed to scan workspace: ${error}`);
  }
  
  // If no subprojects detected, treat entire workspace as single project
  if (subprojects.length === 0) {
    subprojects.push(projectName);
  }
  
  return {
    projectName,
    projectRoot: workspacePath,
    subprojects
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
}): Promise<InitResult> {
  const { workspace_path, project_name } = args;
  const errors: string[] = [];
  const createdFolders: string[] = [];
  const createdRulesFiles: string[] = [];
  
  try {
    // Detect project structure
    const structure = detectProjectStructure(workspace_path);
    
    // Override project name if provided
    if (project_name) {
      structure.projectName = project_name;
    }
    
    // Create project root in storage root
    const projectPath = join(DOCS_ROOT, structure.projectName);
    if (!existsSync(projectPath)) {
      mkdirSync(projectPath, { recursive: true });
      createdFolders.push(structure.projectName);
    }
    
    // Create root-level jobs/to-do and jobs/done-to-do folders
    const jobsPath = join(DOCS_ROOT, 'jobs');
    const jobsToDoPath = join(jobsPath, 'to-do');
    const jobsDonePath = join(jobsPath, 'done-to-do');
    
    if (!existsSync(jobsToDoPath)) {
      mkdirSync(jobsToDoPath, { recursive: true });
      createdFolders.push('jobs/to-do');
    }
    
    if (!existsSync(jobsDonePath)) {
      mkdirSync(jobsDonePath, { recursive: true });
      createdFolders.push('jobs/done-to-do');
    }
    
    // Create subproject folders with to-do/done-to-do structure
    for (const subproject of structure.subprojects) {
      // If single-project (subproject equals project), flatten structure
      const basePath = subproject === structure.projectName
        ? projectPath
        : join(projectPath, subproject);

      // Create base folder when needed (for nested case)
      if (!existsSync(basePath)) {
        mkdirSync(basePath, { recursive: true });
        if (basePath !== projectPath) {
          createdFolders.push(`${structure.projectName}/${subproject}`);
        }
      }

      // Create to-do folder
      const toDoPath = join(basePath, 'to-do');
      if (!existsSync(toDoPath)) {
        mkdirSync(toDoPath, { recursive: true });
        createdFolders.push(`${structure.projectName}${basePath === projectPath ? '' : `/${subproject}`}/to-do`);
      }

      // Create done-to-do folder
      const donePath = join(basePath, 'done-to-do');
      if (!existsSync(donePath)) {
        mkdirSync(donePath, { recursive: true });
        createdFolders.push(`${structure.projectName}${basePath === projectPath ? '' : `/${subproject}`}/done-to-do`);
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
        subprojects: []
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
  
  let output = `PROJECT INITIALIZED\n\n`;
  output += `Project: ${result.projectStructure.projectName} | Subprojects: ${result.projectStructure.subprojects.join(', ')}\n\n`;
  
  output += `CREATED (${result.createdFolders.length} folders)\n`;
  for (const folder of result.createdFolders) {
    output += `${folder}\n`;
  }
  
  output += `\nORGANIZATION RULES\n`;
  output += `${rules}\n\n`;
  
  output += `NEXT: create_job → process_docs → move_task when done\n`;
  output += `Each subproject has to-do/ and done-to-do/ for task organization`;
  
  return output;
}
