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
export async function handleListCompletedJobs(args?: { workspace_path?: string }) {
  try {
    // Validate workspace identifier if provided
    if (args?.workspace_path) {
      validateWorkspaceIdentifier(args.workspace_path);
    }
    const workspace_path = args?.workspace_path || 'default';
    const storage = await loadCONDUCKSWorkspace(workspace_path);

    // Filter for completed jobs (all tasks completed, or no tasks)
    const completedJobsRecords = storage.jobs.filter((j: any) => {
      const total = j.tasks.length;
      return total === 0 || j.tasks.every((t: any) => t.status === 'completed');
    });

    let output = `completed_jobs[${completedJobsRecords.length}]:\n`;

    if (completedJobsRecords.length === 0) {
      output += `  none: true`;
    } else {
      for (const job of completedJobsRecords) {
        const taskCount = job.tasks.length;
        output += `  - id: ${job.id}\n`;
        output += `    title: ${job.title}\n`;
        output += `    tasks_total: ${taskCount}\n`;
        output += `    tasks_percent: 100\n`;
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
      content: [{ type: "text", text: `completed_jobs_error: ${error}` }]
    };
  }
}

import { Tool } from '../core/tool-registry.js';

export const listCompletedJobsTool: Tool<{ workspace_path?: string }> = {
  name: "list_completed_jobs",
  description: "List all completed jobs for a specific workspace.",
  inputSchema: {
    type: "object",
    properties: {
      workspace_path: { type: "string", description: "Workspace identifier" }
    },
    required: ["workspace_path"]
  },
  handler: handleListCompletedJobs,
  formatter: (result: any) => result.content[0].text
};
