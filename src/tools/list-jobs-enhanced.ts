import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { DOCS_ROOT } from '../core/config.js';
import { loadCONDUCKS } from '../core/storage.js';

/**
 * Inline rules
 */
function getInlineRules(): string {
  return `\nRULES: Group by 2+ criteria (journey/complexity/team/frequency) | Split at: 50 tasks OR 20k chars`;
}

/**
 * Enhanced list_jobs - Shows jobs with all tasks in TOON style
 */
export async function handleListJobsEnhanced(args?: { job_id?: number }) {
  try {
    const storage = await loadCONDUCKS();
    
    // If job_id provided, show detailed single job view
    if (args?.job_id) {
      return handleGetJobDetailed(args.job_id);
    }
    
    // Get jobs from to-do and done-to-do folders
    const toDoDir = join(DOCS_ROOT, 'jobs', 'to-do');
    const doneDir = join(DOCS_ROOT, 'jobs', 'done-to-do');
    
    let activeJobs: string[] = [];
    let completedJobs: string[] = [];
    
    if (existsSync(toDoDir)) {
      activeJobs = readdirSync(toDoDir).filter(f => f.endsWith('.md'));
    }
    
    if (existsSync(doneDir)) {
      completedJobs = readdirSync(doneDir).filter(f => f.endsWith('.md'));
    }
    
    let output = `════════════════════════════════════════\n`;
    output += `JOBS OVERVIEW\n`;
    output += `════════════════════════════════════════\n\n`;
    
    // Active jobs
    output += `▼ ACTIVE JOBS (${activeJobs.length})\n`;
    output += `────────────────────────────────────────\n`;
    if (activeJobs.length === 0) {
      output += `  None | Use create_job to start\n`;
    } else {
      for (const jobFile of activeJobs.slice(0, 10)) {
        const jobId = jobFile.match(/^(\d+)_/)?.[1];
        const jobName = jobFile.replace(/^\d+_/, '').replace('.md', '').replace(/-/g, ' ');
        
        // Get task count from jobs.toon
        const job = storage.jobs.find(j => j.id === parseInt(jobId || '0'));
        const taskCount = job ? job.tasks.length : 0;
        const completedTasks = job ? job.tasks.filter(t => t.status === 'completed').length : 0;
        
        output += `  [${jobId}] ${jobName} | Tasks: ${completedTasks}/${taskCount}\n`;
      }
      if (activeJobs.length > 10) {
        output += `  ... +${activeJobs.length - 10} more\n`;
      }
    }
    
    output += `\n▼ COMPLETED JOBS (${completedJobs.length})\n`;
    output += `────────────────────────────────────────\n`;
    if (completedJobs.length === 0) {
      output += `  None\n`;
    } else {
      for (const jobFile of completedJobs.slice(0, 5)) {
        const jobId = jobFile.match(/^(\d+)_/)?.[1];
        const jobName = jobFile.replace(/^\d+_/, '').replace('.md', '').replace(/-/g, ' ');
        output += `  [${jobId}] ${jobName}\n`;
      }
      if (completedJobs.length > 5) {
        output += `  ... +${completedJobs.length - 5} more\n`;
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
async function handleGetJobDetailed(jobId: number) {
  try {
    const storage = await loadCONDUCKS();
    
    // Find job file
    const toDoDir = join(DOCS_ROOT, 'jobs', 'to-do');
    const doneDir = join(DOCS_ROOT, 'jobs', 'done-to-do');
    
    let jobFile: string | null = null;
    let status = 'active';
    
    if (existsSync(toDoDir)) {
      const files = readdirSync(toDoDir);
      const found = files.find(f => f.startsWith(String(jobId).padStart(3, '0')));
      if (found) {
        jobFile = join(toDoDir, found);
      }
    }
    
    if (!jobFile && existsSync(doneDir)) {
      const files = readdirSync(doneDir);
      const found = files.find(f => f.startsWith(String(jobId).padStart(3, '0')));
      if (found) {
        jobFile = join(doneDir, found);
        status = 'completed';
      }
    }
    
    if (!jobFile) {
      return {
        content: [{ type: "text", text: `JOB NOT FOUND | Job ${jobId} not in to-do/ or done-to-do/` }]
      };
    }
    
    // Read job file
    const jobContent = readFileSync(jobFile, 'utf-8');
    
    // Get tasks from jobs.toon
    const job = storage.jobs.find(j => j.id === jobId);
    
    let output = `JOB ${String(jobId).padStart(3, '0')} | Status: ${status}\n\n`;
    
    // Extract key sections from job file
    const descMatch = jobContent.match(/DESCRIPTION\n\n([^\n]+)/);
    const objMatch = jobContent.match(/OBJECTIVES\n\n([\s\S]*?)(?=\n[A-Z]|\n\n[A-Z]|$)/);
    const linkedMatch = jobContent.match(/LINKED TASKS\n\n([\s\S]*?)(?=\n[A-Z]|\n\n[A-Z]|$)/);
    
    if (descMatch) {
      output += `DESC: ${descMatch[1]}\n\n`;
    }
    
    if (objMatch) {
      const objectives = objMatch[1].split('\n').filter(l => l.trim());
      output += `OBJECTIVES\n${objectives.join('\n')}\n\n`;
    }
    
    if (job && job.tasks.length > 0) {
      output += `TASKS (${job.tasks.length})\n`;
      for (const task of job.tasks) {
        output += `${task.id}: ${task.title} | ${task.status} | ${task.service} | ${task.complexity}\n`;
      }
      output += `\n`;
    }
    
    if (linkedMatch) {
      output += `LINKED FILES\n${linkedMatch[1].trim()}\n\n`;
    }
    
    output += `ACTIONS\n`;
    output += `edit_task: Modify task fields\n`;
    output += `move_task: Archive domain files\n`;
    output += `complete_job: Move to done-to-do${getInlineRules()}`;
    
    return {
      content: [{ type: "text", text: output }]
    };
    
  } catch (error) {
    return {
      content: [{ type: "text", text: `GET FAILED | ${error}` }]
    };
  }
}
