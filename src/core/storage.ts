// CONDUCKS Storage Layer
// Handles TOON file operations, JSON parsing, and data persistence

import fs from 'fs-extra';
import * as path from 'path';
import { decode, encode } from '@toon-format/toon';
import { CONDUCKSStorage, Job } from './types.js';
import { DOCS_ROOT, JOBS_FILE } from './config.js';

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
 * Load CONDUCKS data from TOON file
 */
export async function loadCONDUCKS(): Promise<CONDUCKSStorage> {
  try {
    await fs.ensureDir(DOCS_ROOT);

    if (await fs.pathExists(JOBS_FILE)) {
      log(`Loading TOON data from: ${JOBS_FILE}`);
      const fileContent = await fs.readFile(JOBS_FILE, 'utf-8');

      // Decode TOON format to JSON
      const parsedData = decode(fileContent);

      // Validate structure
      if (typeof parsedData === 'object' && parsedData !== null &&
          'jobs' in parsedData && 'crossReferences' in parsedData) {
        return parsedData as unknown as CONDUCKSStorage;
      }

      log('Invalid TOON file structure, creating new database', 'warn');
      throw new Error('Invalid TOON file structure');
    }

    // Create initial database
    const initial: CONDUCKSStorage = { jobs: [], crossReferences: {} };
    await fs.writeFile(JOBS_FILE, JSON.stringify(initial, null, 2));
    log('Created new TOON database');
    return initial;

  } catch (error: any) {
    log(`Storage load error: ${error.message}`, 'error');
    // Return empty database as fallback
    return { jobs: [], crossReferences: {} };
  }
}

/**
 * Save CONDUCKS data to TOON file (stored as JSON for now, converted later)
 */
export async function saveCONDUCKS(storage: CONDUCKSStorage): Promise<void> {
  try {
    await fs.ensureDir(DOCS_ROOT);

    // For now, save as JSON but with .toon extension
    // TODO: Convert to actual TOON format when ready
    await fs.writeFile(JOBS_FILE, JSON.stringify(storage, null, 2));
    log(`Saved ${storage.jobs.length} jobs to TOON file`);

  } catch (error: any) {
    log(`Storage save error: ${error.message}`, 'error');
    throw error;
  }
}

// ============================
// Job Management Operations
// ============================

/**
 * Generate next available job ID
 */
export async function getNextJobId(): Promise<number> {
  const storage = await loadCONDUCKS();
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

  if (!job.tasks || !Array.isArray(job.tasks)) {
    errors.push('Job must have tasks array');
  } else if (job.tasks.length === 0) {
    errors.push('Job must have at least one task');
  }

  if (!job.created) {
    errors.push('Job creation timestamp is required');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Backup CONDUCKS data before major operations
 */
export async function backupCONDUCKS(backupId?: string): Promise<string> {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:]/g, '-');
  const backupName = backupId || `backup_${timestamp}`;
  const backupPath = path.join(DOCS_ROOT, 'backups', `${backupName}.json`);

  try {
    await fs.ensureDir(path.dirname(backupPath));
    const currentData = await loadCONDUCKS();
    await fs.writeFile(backupPath, JSON.stringify(currentData, null, 2));
    log(`Backup created: ${backupPath}`);
    return backupPath;
  } catch (error: any) {
    log(`Backup failed: ${error.message}`, 'error');
    throw error;
  }
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

// ============================
// Statistics and Analytics
// ============================

/**
 * Get storage statistics
 */
export async function getStorageStats() {
  try {
    const stat = await fs.stat(JOBS_FILE);

    return {
      fileSize: stat.size,
      lastModified: stat.mtime.toISOString(),
      exists: true
    };
  } catch {
    return {
      fileSize: 0,
      lastModified: null,
      exists: false
    };
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

// ============================
// Export Interface
// ============================

export const StorageService = {
  load: loadCONDUCKS,
  save: saveCONDUCKS,
  getNextJobId,
  validateJob,
  backup: backupCONDUCKS,
  jsonToToon,
  toonToJson,
  getStats: getStorageStats,
  getProjectStats
};

export default StorageService;
