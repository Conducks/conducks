/**
 * Tools Index - Central export point for all CONDUCKS tools
 */

// Unified architecture tools
export { handleInitializeProjectStructure, formatInitResult } from './initialize-project-structure.js';
export { handleCreateJob, formatCreateJobResult } from './create-job.js';
export { handleCompleteJob, formatCompleteJobResult } from './complete-job.js';
export { handleSmartInfo, formatSmartInfoResult } from './smart-info.js';
export { handleMoveTask, formatMoveTaskResult } from './move-task.js';
export { handleListJobsEnhanced } from './list-jobs-enhanced.js';

// Comprehensive CRUD operations
export {
  handleEditTask,
  formatEditTaskResult,
  handleReplaceLines,
  formatReplaceLinesResult,
  handleRewriteDomain,
  formatRewriteDomainResult,
  handleAppendTask,
  formatAppendTaskResult,
  handleRemoveTask,
  formatRemoveTaskResult
} from './domain-crud.js';
