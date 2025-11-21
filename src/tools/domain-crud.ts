import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { DOCS_ROOT } from '../core/config.js';

/**
 * Inline rules (shown in all responses)
 */
function getInlineRules(): string {
  return `\nRULES: Group by 2+ criteria (journey/complexity/team/frequency) | Split at: 50 tasks OR 20k chars`;
}

/**
 * Resolve the preferred base path for a given project/subproject.
 * If project and subproject are the same (or subproject is empty),
 * use a single-level folder (e.g., <storage>/application).
 */
function resolvePreferredBase(project: string, subproject: string): string {
  const base = (!subproject || subproject.trim() === '' || subproject === project)
    ? join(DOCS_ROOT, project)
    : join(DOCS_ROOT, project, subproject);
  console.error(`[CONDUCKS DEBUG] resolvePreferredBase project=${project} subproject=${subproject} -> ${base}`);
  return base;
}

/**
 * Generate candidate search paths for an existing domain file, supporting both
 * legacy nested (project/subproject) and flattened (project-only) layouts.
 */
function getCandidatePaths(project: string, subproject: string, domainFile: string): string[] {
  const nestedBase = join(DOCS_ROOT, project, subproject);
  const flatBase = join(DOCS_ROOT, project);

  const bases = Array.from(new Set([nestedBase, flatBase]));

  const candidates: string[] = [];
  for (const base of bases) {
    candidates.push(
      join(base, 'to-do', domainFile),
      join(base, 'done-to-do', domainFile),
      join(base, domainFile)
    );
  }
  console.error(`[CONDUCKS DEBUG] candidatePaths for ${project}/${subproject}/${domainFile}:`);
  for (const c of candidates) console.error(` - ${c}`);
  return candidates;
}

/**
 * Find domain file in subproject (checks to-do/, done-to-do/, and root) across
 * both flattened and nested layouts.
 */
function findDomainFile(project: string, subproject: string, domainFile: string): string | null {
  const candidates = getCandidatePaths(project, subproject, domainFile);
  for (const path of candidates) {
    if (existsSync(path)) {
      return path;
    }
  }
  return null;
}

/**
 * Ensure a domain file exists in the preferred layout. If it does not exist,
 * create it under to-do/ with a minimal template and return its path.
 */
function ensureDomainFile(project: string, subproject: string, domainFile: string): string {
  // If file already exists anywhere, return that path
  const existing = findDomainFile(project, subproject, domainFile);
  if (existing) {
    console.error(`[CONDUCKS DEBUG] using existing domain file at ${existing}`);
    return existing;
  }

  const base = resolvePreferredBase(project, subproject);
  const todoDir = join(base, 'to-do');
  mkdirSync(todoDir, { recursive: true });

  const filePath = join(todoDir, domainFile);
  if (!existsSync(filePath)) {
    const title = domainFile.replace(/\.md$/i, '').replace(/[-_]/g, ' ');
    const template = `# ${title}\n\nTASKS\n`;
    writeFileSync(filePath, template, 'utf-8');
    console.error(`[CONDUCKS DEBUG] created missing domain file at ${filePath}`);
  }
  return filePath;
}

// ==================== EDIT TASK ====================

interface EditTaskArgs {
  project: string;
  subproject: string;
  domain_file: string;
  task_id: number;
  updates: {
    status?: string;
    team?: string;
    complexity?: string;
    description?: string;
  };
}

interface EditTaskResult {
  success: boolean;
  message: string;
}

export async function handleEditTask(args: EditTaskArgs): Promise<EditTaskResult> {
  try {
    const { project, subproject, domain_file, task_id, updates } = args;
    
    const filePath = findDomainFile(project, subproject, domain_file);
    if (!filePath) {
      return { success: false, message: `Domain file not found: ${domain_file}` };
    }
    
    let content = readFileSync(filePath, 'utf-8');
    const taskRegex = new RegExp(`(Task ${task_id}:[^\n]*\n(?:Status:[^\n]*\n|Team:[^\n]*\n|Complexity:[^\n]*\n|Job:[^\n]*\n|Depends:[^\n]*\n)*Desc:[^\n]*\n)`, 'g');
    
    if (!taskRegex.test(content)) {
      return { success: false, message: `Task ${task_id} not found in ${domain_file}` };
    }
    
    // Reset regex
    const taskMatch = content.match(new RegExp(`Task ${task_id}:[^\n]*\n((?:Status:|Team:|Complexity:|Job:|Depends:|Desc:)[^\n]*\n)*`));
    if (!taskMatch) {
      return { success: false, message: `Task ${task_id} parsing failed` };
    }
    
    let taskBlock = taskMatch[0];
    
    // Update fields
    if (updates.status) {
      taskBlock = taskBlock.replace(/Status:[^\n]*\n/, `Status: ${updates.status} | `);
      if (!/Status:/.test(taskBlock)) {
        taskBlock = taskBlock.replace(/\n/, `\nStatus: ${updates.status} | `);
      }
    }
    if (updates.team) {
      taskBlock = taskBlock.replace(/Team:[^\n]*/, `Team: ${updates.team}`);
    }
    if (updates.complexity) {
      taskBlock = taskBlock.replace(/Complexity:[^\n]*/, `Complexity: ${updates.complexity}`);
    }
    if (updates.description) {
      taskBlock = taskBlock.replace(/Desc:[^\n]*/, `Desc: ${updates.description}`);
    }
    
    content = content.replace(taskMatch[0], taskBlock);
    writeFileSync(filePath, content, 'utf-8');
    
    return {
      success: true,
      message: `UPDATED Task ${task_id} in ${domain_file}${getInlineRules()}`
    };
  } catch (error) {
    return { success: false, message: `Edit failed: ${error}` };
  }
}

// ==================== REPLACE LINES ====================

interface ReplaceLinesArgs {
  project: string;
  subproject: string;
  domain_file: string;
  start_line: number;
  end_line: number;
  replacement_text: string;
}

interface ReplaceLinesResult {
  success: boolean;
  message: string;
}

export async function handleReplaceLines(args: ReplaceLinesArgs): Promise<ReplaceLinesResult> {
  try {
    const { project, subproject, domain_file, start_line, end_line, replacement_text } = args;
    
    const filePath = findDomainFile(project, subproject, domain_file);
    if (!filePath) {
      return { success: false, message: `Domain file not found: ${domain_file}` };
    }
    
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    // Validate line numbers
    if (start_line < 1 || end_line > lines.length || start_line > end_line) {
      return { 
        success: false, 
        message: `Invalid line range: ${start_line}-${end_line} (file has ${lines.length} lines)` 
      };
    }
    
    // Replace lines (convert to 0-indexed)
    const before = lines.slice(0, start_line - 1);
    const after = lines.slice(end_line);
    const newLines = [...before, replacement_text, ...after];
    
    writeFileSync(filePath, newLines.join('\n'), 'utf-8');
    
    return {
      success: true,
      message: `REPLACED lines ${start_line}-${end_line} in ${domain_file}${getInlineRules()}`
    };
  } catch (error) {
    return { success: false, message: `Replace failed: ${error}` };
  }
}

export function formatReplaceLinesResult(result: ReplaceLinesResult): string {
  return result.message;
}

// ==================== REWRITE DOMAIN ====================

interface RewriteDomainArgs {
  project: string;
  subproject: string;
  domain_file: string;
  new_content: string; // Complete new file content
}

interface RewriteDomainResult {
  success: boolean;
  message: string;
  char_count: number;
  task_count: number;
  health_status: string;
}

export async function handleRewriteDomain(args: RewriteDomainArgs): Promise<RewriteDomainResult> {
  try {
    const { project, subproject, domain_file, new_content } = args;
    
    const filePath = findDomainFile(project, subproject, domain_file);
    if (!filePath) {
      return {
        success: false,
        message: `Domain file not found: ${domain_file}`,
        char_count: 0,
        task_count: 0,
        health_status: 'unknown'
      };
    }
    
    writeFileSync(filePath, new_content, 'utf-8');
    
    // Calculate health metrics
    const charCount = new_content.length;
    const taskMatches = new_content.match(/Task \d+:/g);
    const taskCount = taskMatches ? taskMatches.length : 0;
    
    let healthStatus = 'Healthy';
    if (taskCount >= 50 || charCount >= 20000) {
      healthStatus = 'Split Recommended';
    } else if (taskCount >= 40 || charCount >= 15000) {
      healthStatus = 'Warning';
    }
    
    return {
      success: true,
      message: `REWROTE ${domain_file}${getInlineRules()}`,
      char_count: charCount,
      task_count: taskCount,
      health_status: healthStatus
    };
  } catch (error) {
    return {
      success: false,
      message: `Rewrite failed: ${error}`,
      char_count: 0,
      task_count: 0,
      health_status: 'error'
    };
  }
}

// ==================== APPEND TASK ====================

interface AppendTaskArgs {
  project: string;
  subproject: string;
  domain_file: string;
  task_content: string; // Full task block to append
}

interface AppendTaskResult {
  success: boolean;
  message: string;
  new_task_count: number;
}

export async function handleAppendTask(args: AppendTaskArgs): Promise<AppendTaskResult> {
  try {
    const { project, subproject, domain_file, task_content } = args;
    
    // Ensure the domain file exists (auto-create if missing)
    const filePath = ensureDomainFile(project, subproject, domain_file);
    
    let content = readFileSync(filePath, 'utf-8');
    
    // Append to TASKS section
    const tasksRegex = /(TASKS[^\n]*\n)([\s\S]*?)(?=\n[A-Z]+\n|$)/;
    const match = content.match(tasksRegex);
    
    if (match) {
      const updatedTasks = `${match[1]}${match[2]}\n${task_content}\n`;
      content = content.replace(tasksRegex, updatedTasks);
    } else {
      // No TASKS section, append at end
      content += `\n\nTASKS\n\n${task_content}\n`;
    }
    
    writeFileSync(filePath, content, 'utf-8');
    
    const taskMatches = content.match(/Task \d+:/g);
    const newTaskCount = taskMatches ? taskMatches.length : 0;
    
    return {
      success: true,
      message: `APPENDED task to ${domain_file} | Total: ${newTaskCount}${getInlineRules()}`,
      new_task_count: newTaskCount
    };
  } catch (error) {
    return { success: false, message: `Append failed: ${error}`, new_task_count: 0 };
  }
}

// ==================== REMOVE TASK ====================

interface RemoveTaskArgs {
  project: string;
  subproject: string;
  domain_file: string;
  task_id: number;
}

interface RemoveTaskResult {
  success: boolean;
  message: string;
  remaining_tasks: number;
}

export async function handleRemoveTask(args: RemoveTaskArgs): Promise<RemoveTaskResult> {
  try {
    const { project, subproject, domain_file, task_id } = args;
    
    const filePath = findDomainFile(project, subproject, domain_file);
    if (!filePath) {
      return { success: false, message: `Domain file not found: ${domain_file}`, remaining_tasks: 0 };
    }
    
    let content = readFileSync(filePath, 'utf-8');
    
    // Remove task block
    const taskRegex = new RegExp(`Task ${task_id}:[^\n]*\n(?:Status:[^\n]*\n|Team:[^\n]*\n|Complexity:[^\n]*\n|Job:[^\n]*\n|Depends:[^\n]*\n|Desc:[^\n]*\n)*\n?`, 'g');
    
    if (!taskRegex.test(content)) {
      return { success: false, message: `Task ${task_id} not found`, remaining_tasks: 0 };
    }
    
    content = content.replace(taskRegex, '');
    writeFileSync(filePath, content, 'utf-8');
    
    const taskMatches = content.match(/Task \d+:/g);
    const remainingTasks = taskMatches ? taskMatches.length : 0;
    
    return {
      success: true,
      message: `REMOVED Task ${task_id} from ${domain_file} | Remaining: ${remainingTasks}${getInlineRules()}`,
      remaining_tasks: remainingTasks
    };
  } catch (error) {
    return { success: false, message: `Remove failed: ${error}`, remaining_tasks: 0 };
  }
}

// ==================== FORMAT FUNCTIONS ====================

export function formatEditTaskResult(result: EditTaskResult): string {
  return result.success ? result.message : `EDIT FAILED | ${result.message}`;
}



export function formatRewriteDomainResult(result: RewriteDomainResult): string {
  if (!result.success) {
    return `REWRITE FAILED | ${result.message}`;
  }
  return `${result.message}\nHealth: ${result.health_status} | Tasks: ${result.task_count}/50 | Chars: ${result.char_count}/20000`;
}

export function formatAppendTaskResult(result: AppendTaskResult): string {
  return result.success ? result.message : `APPEND FAILED | ${result.message}`;
}

export function formatRemoveTaskResult(result: RemoveTaskResult): string {
  return result.success ? result.message : `REMOVE FAILED | ${result.message}`;
}
