// CONDUCKS Storage Layer
// Handles TOON file operations, TOON parsing, and data persistence

import fs from 'fs-extra';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { decode, encode } from '@toon-format/toon';
import { CONDUCKSStorage, Job } from './types.js';

// Custom logger
const log = (message: string, level: 'info' | 'error' | 'warn' = 'info') => {
  const timestamp = new Date().toISOString();
  const prefix = level.toUpperCase();
  console.error(`[${timestamp}] CONDUCKS ${prefix}: ${message}`);
};

// ============================
// Core TOON File Operations
// ============================

/**
 * Load all jobs from individual .toon files for a specific workspace
 * @param workspacePath Workspace identifier (e.g., "workspace1", "my-project")
 * @returns Promise<CONDUCKSStorage> containing jobs for the workspace
 */
export async function loadCONDUCKSWorkspace(workspacePath: string): Promise<CONDUCKSStorage> {
    // Use environment variable or default to absolute storage relative to conducks root
    const storageRoot = process.env.CONDUCKS_STORAGE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'storage');
  const paths = {
    jobsToDoDir: path.join(storageRoot, workspacePath, 'jobs/to-do'),
    jobsDoneDir: path.join(storageRoot, workspacePath, 'jobs/done-to-do')
  };
  await fs.ensureDir(paths.jobsToDoDir);
  await fs.ensureDir(paths.jobsDoneDir);

  const jobs: Job[] = [];

  // Load active jobs from to-do
  const todoFiles = await fs.readdir(paths.jobsToDoDir);
  for (const file of todoFiles) {
    if (file.endsWith('.toon')) {
      const filePath = path.join(paths.jobsToDoDir, file);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      try {
        const job = toonToJson(fileContent) as Job;
        jobs.push(job);
      } catch (error) {
        log(`Failed to parse job file ${file}: ${error}`, 'error');
      }
    }
  }

  // Load completed jobs from done-to-do
  const doneFiles = await fs.readdir(paths.jobsDoneDir);
  for (const file of doneFiles) {
    if (file.endsWith('.toon')) {
      const filePath = path.join(paths.jobsDoneDir, file);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      try {
        const job = toonToJson(fileContent) as Job;
        jobs.push(job);
      } catch (error) {
        log(`Failed to parse job file ${file}: ${error}`, 'error');
      }
    }
  }

  log(`Loaded ${jobs.length} jobs for workspace '${workspacePath}' (${todoFiles.filter(f => f.endsWith('.toon')).length} active, ${doneFiles.filter(f => f.endsWith('.toon')).length} completed)`);

  // Build cross-references from jobs
  const crossReferences: { [key: string]: string[] } = {};
  jobs.forEach(job => {
    if (job.crossServiceLinks && job.crossServiceLinks.length > 0) {
      job.crossServiceLinks.forEach(link => {
        if (!crossReferences[link]) {
          crossReferences[link] = [];
        }
        crossReferences[link].push(String(job.id));
      });
    }
  });

  return { jobs, crossReferences };
}


/**
 * Save a single job to its .toon file within a specific workspace
 * @param job Job object to save
 * @param workspacePath Workspace identifier
 * @param isCompleted Whether job is in completed state
 */
export async function saveJobForWorkspace(job: Job, workspacePath: string, isCompleted: boolean = false): Promise<void> {
  try {
    // Use environment variable or default to absolute storage relative to conducks root
    const storageRoot = process.env.CONDUCKS_STORAGE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'storage');
    const paths = {
      jobsToDoDir: path.join(storageRoot, workspacePath, 'jobs/to-do'),
      jobsDoneDir: path.join(storageRoot, workspacePath, 'jobs/done-to-do')
    };
    const targetDir = isCompleted ? paths.jobsDoneDir : paths.jobsToDoDir;

    console.error(`DEBUG: Creating directory ${targetDir} for workspace ${workspacePath}`);
    await fs.ensureDir(targetDir);

    // Generate filename from job id and title
    const jobSlug = job.title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
    const filename = `${String(job.id).padStart(3, '0')}_${jobSlug}.toon`;
    const filePath = path.join(targetDir, filename);

    console.error(`DEBUG: Saving job ${job.id} to ${filePath}`);

    // Save as TOON format
    await fs.writeFile(filePath, jsonToToon(job));

    // Verify the file was written
    if (await fs.pathExists(filePath)) {
      console.error(`DEBUG: File ${filePath} was successfully created`);
    } else {
      console.error(`DEBUG: ERROR - File ${filePath} was NOT created`);
    }

    log(`Saved job ${job.id} for workspace '${workspacePath}' to ${filePath}`);

  } catch (error: any) {
    log(`Failed to save job ${job.id} in workspace '${workspacePath}': ${error.message}`, 'error');
    throw error;
  }
}

/**
 * Generate next available job ID for a specific workspace
 * @param workspacePath Workspace identifier
 * @returns Promise<number> Next available job ID for this workspace
 */
export async function getNextJobIdForWorkspace(workspacePath: string): Promise<number> {
  const storage = await loadCONDUCKSWorkspace(workspacePath);
  if (storage.jobs.length === 0) return 1;
  return Math.max(...storage.jobs.map(job => job.id)) + 1;
}

/**
 * Validate job structure
 */
export function validateJob(job: Job): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!job.id || job.id < 1) {
    errors.push('Job ID must be a positive integer');
  }

  if (!job.title?.trim()) {
    errors.push('Job title is required');
  }

  if (!job.description?.trim()) {
    errors.push('Job description is required');
  }

  // Relaxed validation: allow zero tasks at creation (tasks added later)
  if (!job.tasks || !Array.isArray(job.tasks)) {
    errors.push('Job must have tasks array');
  }

  if (!job.created) {
    errors.push('Job creation timestamp is required');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}



// ============================
// Future TOON Conversion Utilities
// ============================

/**
 * Convert CONDUCKS JSON to TOON format for transmission
 */
export function jsonToToon(data: any): string {
  try {
    return encode(data);
  } catch (error: any) {
    log(`TOON encoding failed: ${error.message}`, 'error');
    return JSON.stringify(data, null, 2); // Fallback to JSON
  }
}

/**
 * Parse TOON format back to JSON for processing
 */
export function toonToJson(toonString: string): any {
  try {
    return decode(toonString);
  } catch (error: any) {
    log(`TOON decoding failed: ${error.message}`, 'error');
    // Try parsing as regular JSON as fallback
    try {
      return JSON.parse(toonString);
    } catch {
      throw new Error('Invalid TOON or JSON format');
    }
  }
}

/**
 * Analyze job/task statistics
 */
export function getProjectStats(storage: CONDUCKSStorage) {
  const totalJobs = storage.jobs.length;
  const totalTasks = storage.jobs.reduce((sum, job) => sum + job.tasks.length, 0);

  const taskStatusCounts: Record<string, number> = {};
  const jobStatusCounts: Record<string, number> = {};

  storage.jobs.forEach(job => {
    jobStatusCounts[job.domain] = (jobStatusCounts[job.domain] || 0) + 1;

    job.tasks.forEach(task => {
      taskStatusCounts[task.status] = (taskStatusCounts[task.status] || 0) + 1;
    });
  });

  const completedTasks = storage.jobs.reduce((sum, job) =>
    sum + job.tasks.filter(task => task.status === 'completed').length, 0
  );

  return {
    totalJobs,
    totalTasks,
    completedTasks,
    completionRate: totalTasks > 0 ? (completedTasks / totalTasks * 100).toFixed(1) + '%' : '0%',
    domainBreakdown: jobStatusCounts,
    statusBreakdown: taskStatusCounts
  };
}

export default {
  loadCONDUCKSWorkspace,
  saveJobForWorkspace,
  getNextJobIdForWorkspace,
  validateJob,
  jsonToToon,
  toonToJson,
  getProjectStats
};
