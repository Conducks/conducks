/**
 * Tools Index - Central export point for all CONDUCKS tools
 */

// Job management tools
export { handleCreateJob, formatCreateJobResult } from './create-job.js';
export { handleCompleteJob, formatCompleteJobResult } from './complete-job.js';
export { handleDeleteJob, formatDeleteJobResult } from './delete-job.js';

// Task management tools
export { handleCreateTask, formatCreateTaskResult } from './create-task.js';
export { handleMoveTask, formatMoveTaskResult } from './move-task.js';

// System tools
export { handleInitializeProjectStructure, formatInitResult } from './initialize-project-structure.js';
export { handleArchitectureAudit, formatArchitectureAuditResult } from './architecture-audit.js';

// Information tools

export { handleListJobsEnhanced } from './list-jobs-enhanced.js';
export { handleListActiveJobs } from './list-active-jobs.js';
export { handleListCompletedJobs } from './list-completed-jobs.js';

// Domain/file CRUD tools
export { handleEditTask, formatEditTaskResult, handleReplaceLines, formatReplaceLinesResult, handleRewriteDomain, formatRewriteDomainResult, handleAppendTask, formatAppendTaskResult, handleRemoveTask, formatRemoveTaskResult } from './domain-crud.js';
