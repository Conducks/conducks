import { existsSync, mkdirSync, renameSync } from 'fs';
import { join } from 'path';
import { DOCS_ROOT } from '../core/config.js';
import { loadCONDUCKS, saveCONDUCKS } from '../core/storage.js';

interface CompleteJobArgs {
  job_id: number;
  completion_notes?: string;
}

interface CompleteJobResult {
  success: boolean;
  message: string;
  archivedPath?: string;
}

/**
 * Move job from to-do to done-to-do
 */
export async function handleCompleteJob(args: CompleteJobArgs): Promise<CompleteJobResult> {
  try {
    const { job_id, completion_notes } = args;
    
    // Ensure done-to-do directory exists
    const doneDir = join(DOCS_ROOT, 'jobs', 'done-to-do');
    if (!existsSync(doneDir)) {
      mkdirSync(doneDir, { recursive: true });
    }
    
    // Find job file in to-do
    const toDoDir = join(DOCS_ROOT, 'jobs', 'to-do');
    if (!existsSync(toDoDir)) {
      return {
        success: false,
        message: `to-do directory not found`
      };
    }
    
    const fs = require('fs');
    const files = fs.readdirSync(toDoDir);
    const jobFile = files.find((file: string) => 
      file.startsWith(String(job_id).padStart(3, '0'))
    );
    
    if (!jobFile) {
      return {
        success: false,
        message: `Job ${job_id} not found in to-do folder`
      };
    }
    
    const sourcePath = join(toDoDir, jobFile);
    const destPath = join(doneDir, jobFile);
    
    // Move file
    renameSync(sourcePath, destPath);
    
    // Update jobs.toon
    const storage = await loadCONDUCKS();
    const job = storage.jobs.find(j => j.id === job_id);
    
    if (job) {
      // Update file path in job record
      const updatedJobs = storage.jobs.map(j => {
        if (j.id === job_id) {
          return {
            ...j,
            lastUpdated: new Date().toISOString()
          };
        }
        return j;
      });
      
      storage.jobs = updatedJobs;
      await saveCONDUCKS(storage);
    }
    
    return {
      success: true,
      message: `Job ${job_id} completed and archived`,
      archivedPath: `jobs/done-to-do/${jobFile}`
    };
    
  } catch (error) {
    return {
      success: false,
      message: `Failed to complete job: ${error}`
    };
  }
}

/**
 * Format result for MCP response (plain text)
 */
export function formatCompleteJobResult(result: CompleteJobResult): string {
  if (!result.success) {
    return `JOB COMPLETION FAILED\n\n${result.message}`;
  }
  
  let output = `JOB COMPLETED\n\n`;
  output += `${result.message}\n`;
  if (result.archivedPath) {
    output += `Archived to: ${join(DOCS_ROOT, result.archivedPath)}\n\n`;
  }
  output += `Job moved from to-do to done-to-do.\n`;
  output += `All related tasks remain in project/subproject/domain files for reference.\n`;
  
  return output;
}
