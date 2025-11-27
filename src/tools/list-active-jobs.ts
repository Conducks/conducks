import { loadCONDUCKSWorkspace } from '../core/storage.js';
import { validateWorkspaceIdentifier } from '../core/config.js';

interface ListActiveJobsArgs {
  workspace_path: string;
}

/**
 * Inline rules
 */
function getInlineRules(): string {
  return `\nRULES: Group by 2+ criteria (journey/complexity/team/frequency) | Split at: 50 tasks OR 20k chars`;
}

/**
 * List active jobs for a specific workspace - Shows only jobs with incomplete tasks
 * @param args - Contains workspace_path parameter
 * @returns Promise with formatted job list
 */
export async function handleListActiveJobs(args: ListActiveJobsArgs) {
  try {
    // Validate workspace identifier
    validateWorkspaceIdentifier(args.workspace_path);

    const { workspace_path } = args;
    const storage = await loadCONDUCKSWorkspace(workspace_path);
    
    // Filter for active jobs (not all tasks completed)
    const activeJobsRecords = storage.jobs.filter(j => {
      const total = j.tasks.length;
      const completed = j.tasks.filter(t => t.status === 'completed').length;
      return completed < total || total === 0; // zero-task jobs considered active
    });
    
    let output = `active_jobs[${activeJobsRecords.length}]:\n`;

    if (activeJobsRecords.length === 0) {
      output += `  none: true\n`;
      output += `  usage: "create_job to start"`;
    } else {
      for (const job of activeJobsRecords) {
        const taskCount = job.tasks.length;
        const completedTasks = job.tasks.filter(t => t.status === 'completed').length;
        const percentage = taskCount > 0 ? Math.round((completedTasks / taskCount) * 100) : 0;
        output += `  - id: ${job.id}\n`;
        output += `    title: ${job.title}\n`;
        output += `    tasks_complete: ${completedTasks}\n`;
        output += `    tasks_total: ${taskCount}\n`;
        output += `    tasks_percent: ${percentage}\n`;
        output += `    domain: ${job.domain || 'general'}\n`;
        output += `    created: '${job.created}'\n`;
      }

      output += `usage: list_jobs_enhanced {job_id: N}`;
    }

    return {
      content: [{ type: "text", text: output }]
    };

  } catch (error) {
    return {
      content: [{ type: "text", text: `active_jobs_error: ${error}` }]
    };
  }
}
