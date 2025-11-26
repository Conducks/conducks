import { loadCONDUCKSWorkspace } from '../core/storage.js';
import { validateWorkspaceIdentifier } from '../core/config.js';

/**
 * Inline rules
 */
function getInlineRules(): string {
  return `\nRULES: Group by 2+ criteria (journey/complexity/team/frequency) | Split at: 50 tasks OR 20k chars`;
}

/**
 * List completed jobs - Shows only jobs where all tasks are completed
 */
export async function handleListCompletedJobs(args?: { workspace_id?: string }) {
  try {
    // Validate workspace identifier if provided
    if (args?.workspace_id) {
      validateWorkspaceIdentifier(args.workspace_id);
    }
    const workspace_id = args?.workspace_id || 'default';
    const storage = await loadCONDUCKSWorkspace(workspace_id);

    // Filter for completed jobs (all tasks completed, or no tasks)
    const completedJobsRecords = storage.jobs.filter((j: any) => {
      const total = j.tasks.length;
      return total === 0 || j.tasks.every((t: any) => t.status === 'completed');
    });
    
    let output = `════════════════════════════════════════\n`;
    output += `COMPLETED JOBS (${completedJobsRecords.length})\n`;
    output += `════════════════════════════════════════\n\n`;
    
    if (completedJobsRecords.length === 0) {
      output += `  None\n`;
    } else {
      for (const job of completedJobsRecords) {
        const taskCount = job.tasks.length;
        output += `[${String(job.id).padStart(3, '0')}] ${job.title}\n`;
        output += `      Tasks: ${taskCount}/${taskCount} (100%) | Domain: ${job.domain || 'none'}\n`;
        output += `      Created: ${job.created}\n\n`;
      }
    }
    
    output += `════════════════════════════════════════\n`;
    output += `USAGE: list_jobs_enhanced {job_id: N} for details${getInlineRules()}`;
    
    return {
      content: [{ type: "text", text: output }]
    };
    
  } catch (error) {
    return {
      content: [{ type: "text", text: `LIST COMPLETED JOBS FAILED | ${error}` }]
    };
  }
}
