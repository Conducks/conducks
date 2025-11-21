// CONDUCKS Configuration Management
// Central configuration for paths, settings, and defaults

import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directory paths - storage relative to conducks root (repository root)
// When built: build/core/config.js -> ../.. gets to conducks root
// Then we use storage/ inside conducks
const SERVER_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_INTERNAL_STORAGE = path.join(SERVER_ROOT, 'storage');
export const DOCS_ROOT = path.resolve(process.env.CONDUCKS_STORAGE_DIR || DEFAULT_INTERNAL_STORAGE);
export const JOBS_FILE = path.join(DOCS_ROOT, 'jobs.toon');

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

// Export all configuration
export const CONDUCKS_CONFIG = {
  DOCS_ROOT,
  JOBS_FILE,
  LOG_LEVEL,
  SERVER_CONFIG,
  DEFAULT_JOB_CONFIG,
  TOON_CONFIG,
  FILE_LIMITS,
  ARCHITECT_CONFIG,
  DOMAIN_MAPPINGS,
  TEAM_ASSIGNMENTS,
  PRIORITY_RULES,
  ALLOWED_STATUS_TRANSITIONS
};

export default CONDUCKS_CONFIG;
