import { existsSync, renameSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { loadCONDUCKSWorkspace, saveJobForWorkspace } from '../core/storage.js';

// NOTE: Tool updated to support dynamic workspace paths

interface MoveTaskArgs {
  workspace_path?: string;
  project: string;
  subproject: string;
  task_file: string; // e.g., "task_001_setup-database.md"
  target_folder: 'to-do' | 'done-to-do' | 'analysis' | 'problem-solution';
  source_folder?: 'to-do' | 'done-to-do' | 'analysis' | 'problem-solution';
}

interface MoveTaskResult {
  success: boolean;
  message: string;
  newPath?: string;
}

/**
 * Move task markdown file between folders (to-do, done-to-do, analysis, problem-solution)
 * Job references remain intact across moves
 */
export async function handleMoveTask(args: MoveTaskArgs): Promise<MoveTaskResult> {
  try {
    const { workspace_path = 'default', project, subproject, task_file, target_folder, source_folder } = args;

    // Import getWorkspacePaths dynamically
    const { getWorkspacePaths } = await import('../core/config.js');
    // Use provided project name or default to ProjectX if missing (for backward compatibility)
    const projectName = project || 'ProjectX';
    const paths = getWorkspacePaths(workspace_path, projectName);

    // Support both multi-service (with project/subproject) and single-repo (workspace root only)
    const subprojectPath = (project && subproject)
      ? paths.getSubprojectDir(subproject, 'to-do').replace('/to-do', '') // Get base subproject dir
      : paths.tasksRoot; // Fallback to project root if subproject missing

    if (!existsSync(subprojectPath)) {
      return {
        success: false,
        message: `Subproject path not found: ${projectName}/${subproject}`
      };
    }

    // Try to find source file if source_folder provided
    let sourcePath: string | null = null;

    if (source_folder) {
      const testPath = join(subprojectPath, source_folder, task_file);
      if (existsSync(testPath)) {
        sourcePath = testPath;
      }
    } else {
      // Search all folders
      const folders = ['to-do', 'done-to-do', 'analysis', 'problem-solution'];
      for (const folder of folders) {
        const testPath = join(subprojectPath, folder, task_file);
        if (existsSync(testPath)) {
          sourcePath = testPath;
          break;
        }
      }
    }

    if (!sourcePath) {
      return {
        success: false,
        message: `Task file not found: ${task_file}`
      };
    }

    const destDir = join(subprojectPath, target_folder);
    const destPath = join(destDir, task_file);

    // Ensure destination directory exists
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }

    // Update task status if moving to/from done-to-do
    if (target_folder === 'done-to-do' || sourcePath.includes('/done-to-do/')) {
      // Extract task ID from filename (task_001_...)
      const taskIdMatch = task_file.match(/^task_(\d+)_/);
      if (taskIdMatch) {
        const taskId = taskIdMatch[1].padStart(3, '0');
        await updateTaskStatus(workspace_path, taskId, target_folder === 'done-to-do');
      }
    }

    // Move file
    renameSync(sourcePath, destPath);

    return {
      success: true,
      message: `Moved ${task_file} to ${target_folder}`,
      newPath: `${project}/${subproject}/${target_folder}/${task_file}`
    };

  } catch (error) {
    return {
      success: false,
      message: `Move failed: ${error}`
    };
  }
}

/**
 * Update task status when moved to/from done-to-do
 */
async function updateTaskStatus(workspace_path: string, taskId: string, isCompleted: boolean): Promise<void> {
  try {
    const storage = await loadCONDUCKSWorkspace(workspace_path);

    // Find job that contains this task
    for (const job of storage.jobs) {
      const task = job.tasks.find((t: any) => t.id === taskId);
      if (task) {
        // Update task status
        task.status = isCompleted ? 'completed' : 'active';
        task.lastUpdated = new Date().toISOString();

        // Update job lastUpdated
        job.lastUpdated = new Date().toISOString();

        // Save the updated job
        await saveJobForWorkspace(job, workspace_path, false);
        break;
      }
    }
  } catch (error) {
    // Log but don't fail the move operation
    console.error('Failed to update task status:', error);
  }
}

/**
 * Format result (TOON style)
 */
export function formatMoveTaskResult(result: MoveTaskResult): string {
  if (!result.success) {
    return `MOVE FAILED | ${result.message}`;
  }

  return `${result.message}\nNew location: ${result.newPath}`;
}
