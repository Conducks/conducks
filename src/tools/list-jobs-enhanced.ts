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
export async function handleListJobsEnhanced(args?: { workspace_id: string; job_id?: number }) {
  try {
    // Validate workspace identifier if provided
    if (args?.workspace_id) {
      validateWorkspaceIdentifier(args.workspace_id);
    }
    const workspace_id = args?.workspace_id || 'default';
    const storage = await loadCONDUCKSWorkspace(workspace_id);

    // If job_id provided, show detailed single job view
    if (args?.job_id) {
      return handleGetJobDetailed(workspace_id, args.job_id);
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
    
    let output = `════════════════════════════════════════\n`;
    output += `JOBS OVERVIEW\n`;
    output += `════════════════════════════════════════\n\n`;
    
    // Active jobs
    output += `▼ ACTIVE JOBS (${activeJobsRecords.length})\n`;
    output += `────────────────────────────────────────\n`;
    if (activeJobsRecords.length === 0) {
      output += `  None | Use create_job to start\n`;
    } else {
      for (const job of activeJobsRecords.slice(0, 10)) {
        const taskCount = job.tasks.length;
        const completedTasks = job.tasks.filter(t => t.status === 'completed').length;
        output += `  [${job.id}] ${job.title} | Tasks: ${completedTasks}/${taskCount}\n`;
      }
      if (activeJobsRecords.length > 10) {
        output += `  ... +${activeJobsRecords.length - 10} more\n`;
      }
    }
    
    output += `\n▼ COMPLETED JOBS (${completedJobsRecords.length})\n`;
    output += `────────────────────────────────────────\n`;
    if (completedJobsRecords.length === 0) {
      output += `  None\n`;
    } else {
      for (const job of completedJobsRecords.slice(0, 5)) {
        output += `  [${job.id}] ${job.title}\n`;
      }
      if (completedJobsRecords.length > 5) {
        output += `  ... +${completedJobsRecords.length - 5} more\n`;
      }
    }
    
    output += `\n════════════════════════════════════════\n`;
    output += `USAGE: list_jobs_enhanced {job_id: N} for details${getInlineRules()}`;
    
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
async function handleGetJobDetailed(workspace_id: string, jobId: number) {
  try {
    const storage = await loadCONDUCKSWorkspace(workspace_id);
    const job = storage.jobs.find((j: any) => j.id === jobId);
    if (!job) {
      return { content: [{ type: "text", text: `JOB NOT FOUND | Job ${jobId}` }] };
    }
    // Note: Job directory structure may have changed with workspace isolation
    const completedTasks = job.tasks.filter((t: any) => t.status === 'completed').length;
    const status = job.tasks.length > 0 && completedTasks === job.tasks.length ? 'completed' : 'active';
    let output = `JOB ${String(job.id).padStart(3, '0')} | Status: ${status}\n\n`;
    output += `TITLE: ${job.title}\n`;
    output += `DOMAIN: ${job.domain}\n`;
    output += `DESCRIPTION: ${job.description}\n\n`;
    if (job.tasks.length > 0) {
      output += `TASKS (${job.tasks.length})\n`;
      for (const task of job.tasks) {
        output += `  ${task.id}: ${task.title} | ${task.status} | ${task.service} | ${task.complexity}\n`;
      }
      output += `\n`;
    }
    output += `ACTIONS\ncreate_task: Add task markdown files\ncomplete_job: Mark job completed${getInlineRules()}`;
    return { content: [{ type: "text", text: output }] };

  } catch (error) {
    return {
      content: [{ type: "text", text: `GET FAILED | ${error}` }]
    };
  }
}
