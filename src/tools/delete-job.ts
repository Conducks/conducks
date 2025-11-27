import fs from 'fs-extra';
import * as path from 'path';
import { loadCONDUCKSWorkspace } from '../core/storage.js';
import { validateWorkspaceIdentifier } from '../core/config.js';

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
    // Validate workspace identifier
    validateWorkspaceIdentifier(args.workspace_path);

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

    // Delete job metadata file (.toon file in global jobs folder)
    const jobSlug = job.title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
    const filename = `${String(job_id).padStart(3, '0')}_${jobSlug}.toon`;
    // Jobs are ALWAYS at storage root (global), not per-workspace
    const storageRoot = process.env.CONDUCKS_STORAGE_ROOT || path.join(process.cwd(), 'storage');

    // Check both to-do and done-to-do folders
    const possiblePaths = [
      path.join(storageRoot, 'jobs', 'to-do', filename),
      path.join(storageRoot, 'jobs', 'done-to-do', filename)
    ];

    for (const jobFilePath of possiblePaths) {
      try {
        await fs.access(jobFilePath);
        await fs.remove(jobFilePath);
        deletedFiles.job_metadata = jobFilePath;
        break;
      } catch (error) {
        // File doesn't exist in this folder, try next
      }
    }


    // Delete task files
    // We need to find where the task files are located.
    // Since SubTask doesn't store the path, we have to search for them.
    // We know the naming convention: task_{id}_{slug}.md

    // Import getWorkspacePaths dynamically
    const { getWorkspacePaths } = await import('../core/config.js');
    // Use workspace_path as project identifier (consistent with create_task)
    const project = workspace_path;
    const paths = getWorkspacePaths(workspace_path, project);
    const tasksRoot = paths.tasksRoot;

    if (await fs.pathExists(tasksRoot)) {
      // Get all subprojects
      const subprojects = (await fs.readdir(tasksRoot, { withFileTypes: true }))
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      const folders = ['to-do', 'done-to-do', 'analysis', 'problem-solution'];

      for (const task of job.tasks) {
        // Construct filename pattern
        // We don't know the exact slug used during creation if title changed, 
        // but usually it's task_{id}_*.md
        // We'll search for files starting with task_{id}_
        const taskPrefix = `task_${task.id}_`;

        for (const subproject of subprojects) {
          for (const folder of folders) {
            const folderPath = path.join(tasksRoot, subproject, folder);
            if (await fs.pathExists(folderPath)) {
              const files = await fs.readdir(folderPath);
              for (const file of files) {
                if (file.startsWith(taskPrefix) && file.endsWith('.md')) {
                  const filePath = path.join(folderPath, file);
                  await fs.remove(filePath);
                  deletedFiles.task_files.push(filePath);
                }
              }
            }
          }
        }
      }
    }

    // Remove from storage
    storage.jobs = storage.jobs.filter((j: any) => j.id !== job_id);

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
    return `delete_job_failed: "${result.message}"`;
  }

  let output = `job_deleted:\n`;
  output += `  message: "${result.message}"\n`;

  if (result.deleted_files) {
    if (result.deleted_files.job_metadata) {
      output += `  job_metadata_deleted: ${result.deleted_files.job_metadata}\n`;
    }

    if (result.deleted_files.task_files.length > 0) {
      output += `  task_files_deleted[${result.deleted_files.task_files.length}]:\n`;
      for (const file of result.deleted_files.task_files) {
        output += `    - ${file}\n`;
      }
    }

    const jobMatch = result.deleted_files.job_metadata?.match(/\/(\d+)_/);
    const jobId = jobMatch?.[1] || 'unknown';
    output += `  warning: "Job ${jobId} permanently deleted - action cannot be undone"`;
  }

  return output;
}
