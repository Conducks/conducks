import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { DOCS_ROOT, JOBS_FILE } from '../core/config.js';
import { loadCONDUCKS } from '../core/storage.js';
import { Job } from '../core/types.js';

interface SmartInfoArgs {
  context?: 'job' | 'project' | 'system';
  job_id?: number;
  project_name?: string;
  subproject_name?: string;
}

interface SmartInfoResult {
  context: string;
  content: string;
}

/**
 * Get active jobs from to-do folder
 */
function getActiveJobs(): string[] {
  const toDoDir = join(DOCS_ROOT, 'jobs', 'to-do');
  if (!existsSync(toDoDir)) {
    return [];
  }
  
  return readdirSync(toDoDir)
    .filter(file => file.endsWith('.md'))
    .map(file => file.replace('.md', ''));
}

/**
 * Get completed jobs from done-to-do folder
 */
function getCompletedJobs(): string[] {
  const doneDir = join(DOCS_ROOT, 'jobs', 'done-to-do');
  if (!existsSync(doneDir)) {
    return [];
  }
  
  return readdirSync(doneDir)
    .filter(file => file.endsWith('.md'))
    .map(file => file.replace('.md', ''));
}

/**
 * Get projects in storage root
 */
function getProjects(): string[] {
  if (!existsSync(DOCS_ROOT)) {
    return [];
  }
  
  return readdirSync(DOCS_ROOT)
    .filter(item => {
      const itemPath = join(DOCS_ROOT, item);
      const stat = statSync(itemPath);
      return stat.isDirectory() && item !== 'jobs';
    });
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
function generateSystemOverview(): string {
  const activeJobs = getActiveJobs();
  const completedJobs = getCompletedJobs();
  const projects = getProjects();
  
  let output = `CONDUCKS SYSTEM\n\n`;
  
  output += `OVERVIEW\n`;
  output += `Task orchestration via MCP | Jobs→Tasks hierarchy | File-based storage\n\n`;
  
  output += `TOOLS\n`;
  output += `create_job: New job in to-do/\n`;
  output += `move_job: Move job to-do↔done-to-do\n`;
  output += `complete_job: Archive job to done-to-do\n`;
  output += `process_docs: Create tasks in domains\n`;
  output += `move_task: Move domain to-do↔done-to-do\n`;
  output += `smart_info: This tool (single call)\n`;
  output += `initialize_project_structure: Mirror workspace\n\n`;
  
  output += `WORKFLOW\n`;
  output += `1. initialize_project_structure (from workspace)\n`;
  output += `2. create_job (in jobs/to-do/)\n`;
  output += `3. process_docs (tasks → subproject/to-do/domain.md)\n`;
  output += `4. move_task to done-to-do when complete\n`;
  output += `5. complete_job when all done\n\n`;
  
  output += `BENEFITS\n`;
  output += `Single call | Keyword responses | Inline rules | Rich CRUD | Token efficient\n\n`;
  
  output += `CURRENT STATE\n`;
  output += `Active Jobs: ${activeJobs.length}`;
  if (activeJobs.length > 0) {
    output += ` (${activeJobs.slice(0, 3).join(', ')})`;
  }
  output += `\n`;
  output += `Completed Jobs: ${completedJobs.length}\n`;
  output += `Projects: ${projects.length}`;
  if (projects.length > 0) {
    output += ` (${projects.join(', ')})`;
  }
  output += `\n\n`;
  
  output += `RULES\n`;
  output += `Group by 2+ criteria (journey/complexity/team/frequency)\n`;
  output += `Split at: 50 tasks OR 20k chars OR 6 months OR 3+ teams`;
  
  return output;
}

/**
 * Generate job-specific context
 */
function generateJobContext(jobId: number): string {
  const jobContent = getJobDetails(jobId);
  
  if (!jobContent) {
    return `JOB NOT FOUND\n\nJob ${jobId} does not exist in jobs/to-do folder.`;
  }
  
  let output = `JOB CONTEXT\n\n${jobContent}\n\n`;
  output += `NEXT ACTIONS\n`;
  output += `Use process_docs to create tasks for this job\n`;
  output += `Tasks will be organized in project/subproject/domain.md files\n`;
  
  return output;
}

/**
 * Generate project-specific context
 */
function generateProjectContext(projectName: string, subprojectName?: string): string {
  const projects = getProjects();
  
  if (!projects.includes(projectName)) {
    return `PROJECT NOT FOUND\n\nProject "${projectName}" not in storage root: ${DOCS_ROOT}.\nUse initialize_project_structure to create it.`;
  }
  
  let output = `PROJECT: ${projectName}\n\n`;
  
  if (subprojectName) {
    // Specific subproject context
    const domainFiles = getDomainFiles(projectName, subprojectName);
    
    output += `SUBPROJECT: ${subprojectName}\n\n`;
    output += `DOMAIN FILES (${domainFiles.length})\n`;
    
    if (domainFiles.length === 0) {
      output += `No domain files yet. Use process_docs to create tasks.\n`;
    } else {
      domainFiles.forEach(domain => {
        output += `${domain.name}: ${domain.taskCount} tasks, ${domain.charCount} chars, ${domain.status}\n`;
      });
    }
    
    // Check for rules file
    const rulesFile = join(DOCS_ROOT, projectName, subprojectName, `rules_${subprojectName}.md`);
    if (existsSync(rulesFile)) {
      output += `\nORGANIZATION RULES\n`;
      output += `See rules_${subprojectName}.md for task grouping guidelines\n`;
    }
  } else {
    // Project overview
    const subprojects = getSubprojects(projectName);
    output += `SUBPROJECTS (${subprojects.length})\n`;
    
    subprojects.forEach(subproject => {
      const domains = getDomainFiles(projectName, subproject);
      const totalTasks = domains.reduce((sum, d) => sum + d.taskCount, 0);
      output += `${subproject}: ${domains.length} domains, ${totalTasks} tasks\n`;
    });
  }
  
  output += `\nNEXT ACTIONS\n`;
  output += `Use process_docs to add tasks to domain files\n`;
  output += `Check domain health to see if files need splitting\n`;
  
  return output;
}

/**
 * Context-aware unified info tool
 */
export async function handleSmartInfo(args: SmartInfoArgs): Promise<SmartInfoResult> {
  try {
    let context = args.context || 'system';
    let content = '';
    
    if (args.job_id) {
      context = 'job';
      content = generateJobContext(args.job_id);
    } else if (args.project_name) {
      context = 'project';
      content = generateProjectContext(args.project_name, args.subproject_name);
    } else {
      context = 'system';
      content = generateSystemOverview();
    }
    
    return {
      context,
      content
    };
    
  } catch (error) {
    return {
      context: 'error',
      content: `Failed to get info: ${error}`
    };
  }
}

/**
 * Format result for MCP response (plain text)
 */
export function formatSmartInfoResult(result: SmartInfoResult): string {
  return result.content;
}
