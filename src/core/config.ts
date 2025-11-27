// CONDUCKS Configuration Management
// Central configuration for paths, settings, and defaults

import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directory paths - now workspace-aware
// When built: build/core/config.js -> ../.. gets to conducks root
const SERVER_ROOT = typeof __dirname !== 'undefined'
  ? path.resolve(__dirname, '../..')
  : path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const DEFAULT_INTERNAL_STORAGE = path.join(SERVER_ROOT, 'storage');

/**
 * Validates workspace identifier for security and format
 * @param identifier Workspace identifier string
 * @returns true if valid, throws Error if invalid
 */
export function validateWorkspaceIdentifier(identifier: string): boolean {
  if (!identifier || typeof identifier !== 'string') {
    throw new Error('Workspace identifier must be a non-empty string');
  }

  if (identifier.trim() !== identifier) {
    throw new Error('Workspace identifier must not have leading/trailing whitespace');
  }

  if (identifier.length === 0 || identifier.length > 100) {
    throw new Error('Workspace identifier must be between 1-100 characters');
  }

  // Reject dangerous characters and path separators
  const dangerousChars = /[\/\\$`\.\.\s]/;
  if (dangerousChars.test(identifier)) {
    throw new Error('Workspace identifier must not contain path separators (/ \\) or special characters ($ ` .. spaces)');
  }

  // Allow only alphanumeric, hyphens, and underscores
  const validChars = /^[a-zA-Z0-9_-]+$/;
  if (!validChars.test(identifier)) {
    throw new Error('Workspace identifier must contain only letters, numbers, hyphens, and underscores');
  }

  return true;
}

function getWorkspacePaths(workspacePath: string, project: string, createPath: boolean = false) {
  // Security: validate workspace path
  if (!workspacePath || typeof workspacePath !== 'string') {
    throw new Error('Invalid workspace path');
  }

  // Security: reject dangerous characters and paths
  if (workspacePath.includes('..') || workspacePath.includes('/') || workspacePath.includes('\\') ||
    workspacePath.includes('$') || workspacePath.includes('`')) {
    throw new Error('Invalid workspace path: security violation');
  }

  const storageRoot = path.resolve(process.env.CONDUCKS_STORAGE_ROOT || DEFAULT_INTERNAL_STORAGE);
  const workspaceDir = path.join(storageRoot, workspacePath);

  return {
    docsRoot: createPath ? workspacePath : workspaceDir,
    jobsRoot: createPath ? path.join(workspacePath, 'jobs') : path.join(workspaceDir, 'jobs'),
    jobsToDoDir: createPath ? path.join(workspacePath, 'jobs', 'to-do') : path.join(workspaceDir, 'jobs', 'to-do'),
    jobsDoneDir: createPath ? path.join(workspacePath, 'jobs', 'done-to-do') : path.join(workspaceDir, 'jobs', 'done-to-do'),
    tasksRoot: createPath ? path.join(workspacePath, project) : path.join(workspaceDir, project),
    getSubprojectDir: (subproject: string | undefined, folder: string = 'to-do') =>
      createPath ?
        path.join(workspacePath, project, subproject || '', folder) :
        path.join(workspaceDir, project, subproject || '', folder)
  };
}
export { getWorkspacePaths };


// Note: Legacy global paths removed. All operations now use workspace-specific paths.
// Migration to workspace isolation complete.

// Logging configuration
export const LOG_LEVEL = process.env.CON_DOCS_LOG_LEVEL || 'info';

// MCP Server configuration
export const SERVER_CONFIG = {
  version: '1.0.0-architect',
  name: 'conducks-architect'
};

// Job/task defaults
export const DEFAULT_JOB_CONFIG = {
  maxTasks: 20,
  autoNumbering: true,
  allowParallelTasks: true,
  requireConfirmation: false // Set to true when Architect Mode is ready
};

// TOON storage configuration
export const TOON_CONFIG = {
  compressArrays: true,
  indentSize: 2,
  delimiter: ',',
  arrayFormat: 'bracket' // jobs[3]: syntax
};

// File system limits
export const FILE_LIMITS = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFilesPerDirectory: 1000,
  maxDirectoryDepth: 5
};

// Architect Mode configuration
export const ARCHITECT_CONFIG = {
  maxQuestionsPerAnalysis: 5,
  requireHumanConfirmation: false,
  autoCreateAnalysisFiles: false,
  enableLearning: true
};

// Domain mappings (for classifying tasks)
export const DOMAIN_MAPPINGS = {
  ml: 'ml-integration',
  ai: 'ml-integration',
  recommendation: 'ml-integration',
  auth: 'poi-discovery',
  user: 'poi-discovery',
  login: 'poi-discovery',
  database: 'infrastructure',
  schema: 'infrastructure',
  api: 'api-management',
  endpoint: 'api-management'
};

// Team assignments by service type
export const TEAM_ASSIGNMENTS = {
  application: 'frontend',
  'ml-engine': 'data-science',
  databaseHub: 'backend',
  datahub: 'backend',
  cdn: 'infrastructure',
  scraper: 'data-engineering',
  default: 'platform'
};

// Priority escalation rules
export const PRIORITY_RULES = {
  critical: ['ml-engine', 'databaseHub', 'security'],
  high: ['application', 'api', 'user-facing'],
  medium: ['internal-tools', 'optimization'],
  low: ['documentation', 'cleanup']
};

// Status transitions (current implementation)
export const ALLOWED_STATUS_TRANSITIONS = {
  pending: ['active', 'blocked', 'cancelled'],
  active: ['completed', 'blocked', 'needs_review'],
  completed: [], // Terminal state
  blocked: ['active', 'cancelled'],
  needs_review: ['completed', 'active', 'blocked'],
  cancelled: [] // Terminal state
};

// Legacy config export removed. All operations now use workspace-specific paths.
// Export only the getWorkspacePaths function and configs that still make sense.
