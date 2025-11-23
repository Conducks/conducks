import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { loadCONDUCKSWorkspace } from '../core/storage.js';

// NOTE: DOCS_ROOT removed - this tool heavily uses deprecated paths and may need major refactoring
const DOCS_ROOT = '/tmp/fallback'; // Temporary fallback - smart-info deprecated

interface SmartInfoArgs {
  workspace_path?: string;
  context?: 'job' | 'system';
  job_id?: number;
}

interface SmartInfoResult {
  context: string;
  content: string;
}

/**
 * Get active jobs from to-do folder
 */
function getJobsOverview(storageJobs: any[]) {
  const active = storageJobs.filter(j => {
    const total = j.tasks.length;
    const completed = j.tasks.filter((t: any) => t.status === 'completed').length;
    return completed < total || total === 0;
  });
  const completed = storageJobs.filter(j => j.tasks.length > 0 && j.tasks.every((t: any) => t.status === 'completed'));
  return { active, completed };
}

/**
 * Get completed jobs from done-to-do folder
 */
function readJobDescription(jobId: number): string | null {
  const jobDir = join(DOCS_ROOT, 'jobs', `job_${String(jobId).padStart(3, '0')}`);
  const jobFile = join(jobDir, 'job.md');
  if (!existsSync(jobFile)) return null;
  return readFileSync(jobFile, 'utf-8');
}

/**
 * Get projects in storage root
 */
function getTasksCount(jobId: number): number {
  const jobDir = join(DOCS_ROOT, 'jobs', `job_${String(jobId).padStart(3, '0')}`);
  const tasksDir = join(jobDir, 'tasks');
  if (!existsSync(tasksDir)) return 0;
  return readdirSync(tasksDir).filter(f => f.startsWith('task_') && f.endsWith('.md')).length;
}

/**
 * Get subprojects for a project
 */
function getSubprojects(projectName: string): string[] {
  const projectPath = join(DOCS_ROOT, projectName);
  if (!existsSync(projectPath)) {
    return [];
  }
  
  return readdirSync(projectPath)
    .filter(item => {
      const itemPath = join(projectPath, item);
      const stat = statSync(itemPath);
      return stat.isDirectory();
    });
}

/**
 * Get domain files for a subproject
 */
function getDomainFiles(projectName: string, subprojectName: string): Array<{
  name: string;
  taskCount: number;
  charCount: number;
  status: string;
}> {
  const subprojectPath = join(DOCS_ROOT, projectName, subprojectName);
  if (!existsSync(subprojectPath)) {
    return [];
  }
  
  const domains: Array<{ name: string; taskCount: number; charCount: number; status: string }> = [];
  
  const files = readdirSync(subprojectPath).filter(file => 
    file.endsWith('.md') && !file.startsWith('rules_')
  );
  
  for (const file of files) {
    const filePath = join(subprojectPath, file);
    const content = readFileSync(filePath, 'utf-8');
    const taskMatches = content.match(/Task \d+:/g);
    const taskCount = taskMatches ? taskMatches.length : 0;
    const charCount = content.length;
    
    let status = 'Healthy';
    if (taskCount >= 50 || charCount >= 20000) {
      status = 'Split Recommended';
    } else if (taskCount >= 40 || charCount >= 15000) {
      status = 'Warning';
    }
    
    domains.push({
      name: file.replace('.md', ''),
      taskCount,
      charCount,
      status
    });
  }
  
  return domains;
}

/**
 * Read job file content
 */
function getJobDetails(jobId: number): string | null {
  const toDoDir = join(DOCS_ROOT, 'jobs', 'to-do');
  if (!existsSync(toDoDir)) {
    return null;
  }
  
  const files = readdirSync(toDoDir);
  const jobFile = files.find(file => file.startsWith(String(jobId).padStart(3, '0')));
  
  if (!jobFile) {
    return null;
  }
  
  return readFileSync(join(toDoDir, jobFile), 'utf-8');
}

/**
 * Generate system overview (TOON style - single call replaces 5)
 */
function generateSystemOverview(storageJobs: any[]): string {
  const { active, completed } = getJobsOverview(storageJobs);
  let output = `CONDUCKS SYSTEM\n\n`;
  output += `MODEL\nJob-centric storage | Each job has tasks/ with individual markdown files\n\n`;
  output += `TOOLS\ncreate_job: Create new job directory\ncreate_task: Add task markdown under job/tasks/\nlist_jobs_enhanced: Overview & details\nsmart_info: System/job context\ncomplete_job: Write completion marker\ninitialize_project_structure: Prepare jobs root\n\n`;
  output += `WORKFLOW\n1. initialize_project_structure\n2. create_job\n3. create_task (repeat)\n4. complete_job when all tasks done\n\n`;
  output += `CURRENT STATE\nActive Jobs: ${active.length}\nCompleted Jobs: ${completed.length}\n\n`;
  output += `RULES\nSplit if >50 tasks OR >20k chars OR multi-team complexity spikes`;  
  return output;
}

/**
 * Generate job-specific context
 */
function generateJobContext(jobId: number, storageJobs: any[]): string {
  const job = storageJobs.find(j => j.id === jobId);
  if (!job) return `JOB NOT FOUND\n\nJob ${jobId} missing.`;
  const content = readJobDescription(jobId);
  const tasksCount = getTasksCount(jobId);
  const completedTasks = job.tasks.filter((t: any) => t.status === 'completed').length;
  const status = tasksCount > 0 && completedTasks === tasksCount ? 'completed' : 'active';
  let output = `JOB ${String(jobId).padStart(3,'0')} | Status: ${status}\n\n`;
  if (content) {
    const descMatch = content.match(/DESCRIPTION\n\n([^\n]+)/);
    if (descMatch) output += `DESC: ${descMatch[1]}\n\n`;
  }
  output += `TASKS (${tasksCount}) Completed: ${completedTasks}/${tasksCount}\n`;
  for (const t of job.tasks) {
    output += `${t.id}: ${t.title} | ${t.status} | ${t.complexity}\n`;
  }
  output += `\nNEXT\ncreate_task → add tasks | complete_job when all done`;
  return output;
}

/**
 * Generate project-specific context (deprecated - keeping for compatibility)
 */
function generateProjectContext(projectName: string, subprojectName?: string): string {
  return `PROJECT CONTEXT (Legacy)\n\nThis feature is deprecated in job-centric model.\nUse list_active_jobs(), list_completed_jobs(), or list_jobs_enhanced({job_id: N}) instead.`;
}

/**
 * Context-aware unified info tool
 */
export async function handleSmartInfo(args: SmartInfoArgs): Promise<SmartInfoResult> {
  try {
    const workspace_path = args.workspace_path || 'default';
    const storage = await loadCONDUCKSWorkspace(workspace_path);
    let context = args.context || 'system';
    let content = '';
    if (args.job_id) {
      context = 'job';
      content = generateJobContext(args.job_id, storage.jobs);
    } else {
      context = 'system';
      content = generateSystemOverview(storage.jobs);
    }
    return { context, content };
  } catch (error) {
    return { context: 'error', content: `Failed to get info: ${error}` };
  }
}

/**
 * Format result for MCP response (plain text)
 */
export function formatSmartInfoResult(result: SmartInfoResult): string {
  return result.content;
}
