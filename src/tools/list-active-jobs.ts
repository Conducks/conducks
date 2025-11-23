import { loadCONDUCKSWorkspace } from '../core/storage.js';

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
    const { workspace_path } = args;
    const storage = await loadCONDUCKSWorkspace(workspace_path);
    
    // Filter for active jobs (not all tasks completed)
    const activeJobsRecords = storage.jobs.filter(j => {
      const total = j.tasks.length;
      const completed = j.tasks.filter(t => t.status === 'completed').length;
      return completed < total || total === 0; // zero-task jobs considered active
    });
    
    let output = `════════════════════════════════════════\n`;
    output += `ACTIVE JOBS (${activeJobsRecords.length})\n`;
    output += `════════════════════════════════════════\n\n`;
    
    if (activeJobsRecords.length === 0) {
      output += `  None | Use create_job to start\n`;
    } else {
      for (const job of activeJobsRecords) {
        const taskCount = job.tasks.length;
        const completedTasks = job.tasks.filter(t => t.status === 'completed').length;
        const percentage = taskCount > 0 ? Math.round((completedTasks / taskCount) * 100) : 0;
        output += `[${String(job.id).padStart(3, '0')}] ${job.title}\n`;
        output += `      Tasks: ${completedTasks}/${taskCount} (${percentage}%) | Domain: ${job.domain || 'none'}\n`;
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
      content: [{ type: "text", text: `LIST ACTIVE JOBS FAILED | ${error}` }]
    };
  }
}
