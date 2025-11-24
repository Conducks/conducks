import fs from 'fs/promises';
import * as path from 'path';
import { loadCONDUCKSWorkspace } from '../core/storage.js';

interface DeleteJobArgs {
  workspace_path: string;
  job_id: number;
  confirm_deletion: boolean;
}

interface DeleteJobResult {
  success: boolean;
  message: string;
  deleted_files?: {
    job_metadata: string;
    task_files: string[];
  };
}

/**
 * Delete job and all associated files
 */
export async function handleDeleteJob(args: DeleteJobArgs): Promise<DeleteJobResult> {
  try {
    const { workspace_path, job_id, confirm_deletion } = args;

    if (!confirm_deletion) {
      return {
        success: false,
        message: 'DELETION CANCELLED: confirm_deletion must be set to true to proceed with deletion.'
      };
    }

    const storage = await loadCONDUCKSWorkspace(workspace_path);
    const job = storage.jobs.find((j: any) => j.id === job_id);

    if (!job) {
      return {
        success: false,
        message: `JOB NOT FOUND: Job ${job_id} does not exist.`
      };
    }

    const deletedFiles: { job_metadata: string; task_files: string[] } = {
      job_metadata: '',
      task_files: []
    };

    // Delete job metadata file (.toon file in workspace)
    const jobSlug = job.title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
    const filename = `${String(job_id).padStart(3, '0')}_${jobSlug}.toon`;
    // Construct path to workspace's jobs/to-do directory
    const storageRoot = process.env.CONDUCKS_STORAGE_ROOT || path.join(process.cwd(), 'storage');
    const jobFilePath = path.join(storageRoot, workspace_path, 'jobs', 'to-do', filename);

    try {
      await fs.access(jobFilePath);
      await fs.rm(jobFilePath);
      deletedFiles.job_metadata = jobFilePath;
    } catch (error) {
      // File doesn't exist, skip it
    }



    // Remove from storage
    storage.jobs = storage.jobs.filter(j => j.id !== job_id);

    return {
      success: true,
      message: `JOB ${job_id} DELETED SUCCESSFULLY\n\nDeleted Job: ${job.title}\nDeleted ${deletedFiles.task_files.length} task files\n\n⚠️  This action cannot be undone.`,
      deleted_files: deletedFiles
    };

  } catch (error) {
    return {
      success: false,
      message: `DELETE FAILED: ${error}`
    };
  }
}

/**
 * Format result for MCP response
 */
export function formatDeleteJobResult(result: DeleteJobResult): string {
  if (!result.success) {
    return `❌ ${result.message}`;
  }

  let output = `🔴 DELETE CONFIRMATION - ACTION COMPLETED\n\n`;
  output += `${result.message}\n\n`;

  if (result.deleted_files) {
    output += `FILES REMOVED:\n`;

    if (result.deleted_files.job_metadata) {
      output += `📁 Job Metadata: ${result.deleted_files.job_metadata}\n`;
    }

    if (result.deleted_files.task_files.length > 0) {
      output += `📄 Task Files (${result.deleted_files.task_files.length}):\n`;
      for (const file of result.deleted_files.task_files) {
        output += `   • ${file}\n`;
      }
    }

    output += `\n⚠️  USER NOTIFICATION: All files for Job #${result.deleted_files.job_metadata?.match(/\/(\d+)_/)?.[1] || 'unknown'} have been permanently deleted.`;
  }

  return output;
}
