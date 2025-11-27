import * as fs from 'fs-extra';
import { join } from 'path';
import { loadCONDUCKSWorkspace } from '../core/storage.js';
import { validateWorkspaceIdentifier } from '../core/config.js';
import { Job } from '../core/types.js';

interface CompleteJobArgs {
  workspace_path: string;
  job_id: number;
  completion_notes: string;
}

interface CompleteJobResult {
  success: boolean;
  message: string;
  archivedPath?: string;
}

/**
 * Move job from jobs/to-do/ to jobs/done-to-do/ within a workspace
 */
export async function handleCompleteJob(args: CompleteJobArgs): Promise<CompleteJobResult> {
  try {
    // Validate workspace identifier
    validateWorkspaceIdentifier(args.workspace_path);

    const { workspace_path, job_id, completion_notes } = args;
    // Use environment variable or default to relative storage
    const storageRoot = process.env.CONDUCKS_STORAGE_ROOT || join(process.cwd(), 'storage');
    // Jobs are ALWAYS at storage root (global), not per-workspace
    const paths = {
      jobsToDoDir: join(storageRoot, 'jobs/to-do'),
      jobsDoneDir: join(storageRoot, 'jobs/done-to-do')
    };
    const storage = await loadCONDUCKSWorkspace(workspace_path);
    const job = storage.jobs.find(j => j.id === job_id);

    if (!job) {
      return { success: false, message: `Job ${job_id} not found` };
    }

    // Verify all tasks completed (or zero tasks)
    const allCompleted = job.tasks.length === 0 || job.tasks.every(t => t.status === 'completed');
    if (!allCompleted) {
      const incompleteTasks = job.tasks.filter(t => t.status !== 'completed');
      return {
        success: false,
        message: `Job ${job_id} has ${incompleteTasks.length} incomplete tasks. Complete all tasks first.`
      };
    }

    // Move job file from to-do to done-to-do
    const jobSlug = job.title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
    const filename = `${String(job.id).padStart(3, '0')}_${jobSlug}.toon`;
    const sourcePath = join(paths.jobsToDoDir, filename);
    const destPath = join(paths.jobsDoneDir, filename);

    if (await fs.pathExists(sourcePath)) {
      await fs.remove(sourcePath);
    }
    const saveJobForWorkspace = await import('../core/storage.js').then(m => m.saveJobForWorkspace);
    await saveJobForWorkspace(job, workspace_path, true);

    // Add completion notes if provided
    if (completion_notes) {
      job.lastUpdated = new Date().toISOString();
      // Notes could be added to job object if needed
    }

    return {
      success: true,
      message: `Job ${job_id} marked completed and moved to done-to-do`,
      archivedPath: `jobs/done-to-do/${filename}`
    };

  } catch (error) {
    return { success: false, message: `Failed to complete job: ${error}` };
  }
}

/**
 * Format result for MCP response (plain text)
 */
export function formatCompleteJobResult(result: CompleteJobResult): string {
  if (!result.success) {
    return `job_completion_failed: "${result.message}"`;
  }

  let output = `job_completed:\n`;
  output += `  message: "${result.message}"\n`;
  if (result.archivedPath) {
    output += `  archived_path: ${result.archivedPath}\n`;
  }
  output += `  note: "job completion marker created"`;

  return output;
}
