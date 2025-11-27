import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { loadCONDUCKSWorkspace } from '../core/storage.js';

/**
 * Inline rules
 */
function getInlineRules(): string {
  return `\nRULES: Group by 2+ criteria (journey/complexity/team/frequency) | Split at: 50 tasks OR 20k chars`;
}

import { validateWorkspaceIdentifier } from '../core/config.js';

/**
 * Enhanced list_jobs - Shows jobs with all tasks in TOON style
 */
export async function handleListJobsEnhanced(args?: { workspace_path: string; job_id?: number }) {
  try {
    // Validate workspace identifier if provided
    if (args?.workspace_path) {
      validateWorkspaceIdentifier(args.workspace_path);
    }
    const workspace_path = args?.workspace_path || 'default';
    const storage = await loadCONDUCKSWorkspace(workspace_path);

    // If job_id provided, show detailed single job view
    if (args?.job_id) {
      return handleGetJobDetailed(workspace_path, args.job_id);
    }
    // Derive active vs completed directly from job/task completion status
    const activeJobsRecords = storage.jobs.filter((j: any) => {
      const total = j.tasks.length;
      const completed = j.tasks.filter((t: any) => t.status === 'completed').length;
      return completed < total || total === 0; // zero-task jobs considered active
    });
    const completedJobsRecords = storage.jobs.filter((j: any) => {
      const total = j.tasks.length;
      return total > 0 && j.tasks.every((t: any) => t.status === 'completed');
    });
    
    let output = `jobs_overview:\n`;
    output += `  active_jobs[${activeJobsRecords.length}]:\n`;

    if (activeJobsRecords.length === 0) {
      output += `    none: true\n`;
      output += `    usage: "create_job to add jobs"\n`;
    } else {
      for (const job of activeJobsRecords.slice(0, 10)) {
        const taskCount = job.tasks.length;
        const completedTasks = job.tasks.filter(t => t.status === 'completed').length;
        output += `    - id: ${job.id}\n`;
        output += `      title: ${job.title}\n`;
        output += `      tasks: ${completedTasks}/${taskCount}\n`;
      }
      if (activeJobsRecords.length > 10) {
        output += `    truncated: ${activeJobsRecords.length - 10}\n`;
      }
    }

    output += `  completed_jobs[${completedJobsRecords.length}]:\n`;
    if (completedJobsRecords.length > 0) {
      for (const job of completedJobsRecords.slice(0, 5)) {
        output += `    - id: ${job.id}\n`;
        output += `      title: ${job.title}\n`;
      }
      if (completedJobsRecords.length > 5) {
        output += `    truncated: ${completedJobsRecords.length - 5}\n`;
      }
    }

    output += `usage: list_jobs_enhanced {job_id: N} for details`;
    
    return {
      content: [{ type: "text", text: output }]
    };
    
  } catch (error) {
    return {
      content: [{ type: "text", text: `LIST FAILED | ${error}` }]
    };
  }
}

/**
 * Get detailed job view with all tasks
 */
async function handleGetJobDetailed(workspace_path: string, jobId: number) {
  try {
    const storage = await loadCONDUCKSWorkspace(workspace_path);
    const job = storage.jobs.find((j: any) => j.id === jobId);
    if (!job) {
      return { content: [{ type: "text", text: `JOB NOT FOUND | Job ${jobId}` }] };
    }
    const completedTasks = job.tasks.filter((t: any) => t.status === 'completed').length;
    const totalTasks = job.tasks.length;
    const status = totalTasks > 0 && completedTasks === totalTasks ? 'completed' : 'active';

    let output = `job_details:\n`;
    output += `  id: ${job.id}\n`;
    output += `  title: "${job.title}"\n`;
    output += `  status: ${status}\n`;
    output += `  domain: "${job.domain || 'general'}"\n`;
    output += `  description: "${job.description || ''}"\n`;
    output += `  tasks[${totalTasks}]:\n`;

    if (totalTasks > 0) {
      for (const task of job.tasks) {
        output += `    - id: ${task.id}\n`;
        output += `      title: ${task.title}\n`;
        output += `      status: ${task.status}\n`;
        output += `      service: ${task.service || ''}\n`;
        output += `      complexity: ${task.complexity || 'simple'}\n`;
      }
    }

    output += `  actions:\n`;
    output += `    create_task: "Add task markdown files"\n`;
    output += `    complete_job: "Mark job completed"`;
    return { content: [{ type: "text", text: output }] };

  } catch (error) {
    return {
      content: [{ type: "text", text: `GET FAILED | ${error}` }]
    };
  }
}
