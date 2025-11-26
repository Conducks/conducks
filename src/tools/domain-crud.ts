// Domain CRUD operations for editing task files and domain files

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

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
    const { readFileSync, writeFileSync } = await import('fs');
    const { join } = await import('path');
    const { getWorkspacePaths } = await import('../core/config.js');

    const paths = getWorkspacePaths(args.project);
    const domainPath = join(paths.tasksRoot, args.subproject, args.domain_file);

    let content = readFileSync(domainPath, 'utf-8');

    // Update specific fields
    if (args.updates.status) {
      content = content.replace(/Status: [^\n]*/, `Status: ${args.updates.status}`);
    }
    if (args.updates.team) {
      content = content.replace(/Team: [^\n]*/, `Team: ${args.updates.team}`);
    }
    if (args.updates.complexity) {
      content = content.replace(/Complexity: [^\n]*/, `Complexity: ${args.updates.complexity}`);
    }
    if (args.updates.description) {
      content = content.replace(/Desc: [^\n]*/, `Desc: ${args.updates.description}`);
    }

    writeFileSync(domainPath, content, 'utf-8');
    return { success: true, message: 'Task attributes updated' };
  } catch (error) {
    return { success: false, message: `Failed to edit task: ${error}` };
  }
}

export function formatEditTaskResult(result: EditTaskResult): string {
  return result.success ? `Task edited successfully` : `Failed to edit task: ${result.message}`;
}

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
    const { readFileSync, writeFileSync } = await import('fs');
    const { join } = await import('path');
    const { getWorkspacePaths } = await import('../core/config.js');

    const paths = getWorkspacePaths(args.project);
    const domainPath = join(paths.tasksRoot, args.subproject, args.domain_file);

    const content = readFileSync(domainPath, 'utf-8');
    const lines = content.split('\n');

    // Replace lines from start_line - 1 to end_line - 1 (convert to 0-based)
    lines.splice(args.start_line - 1, (args.end_line - args.start_line) + 1, args.replacement_text);

    const newContent = lines.join('\n');
    writeFileSync(domainPath, newContent, 'utf-8');
    return { success: true, message: 'Lines replaced' };
  } catch (error) {
    return { success: false, message: `Failed to replace lines: ${error}` };
  }
}

export function formatReplaceLinesResult(result: ReplaceLinesResult): string {
  return result.success ? `Lines replaced successfully` : `Failed to replace lines: ${result.message}`;
}

interface RewriteDomainArgs {
  project: string;
  subproject: string;
  domain_file: string;
  new_content: string;
}

interface RewriteDomainResult {
  success: boolean;
  message: string;
}

export async function handleRewriteDomain(args: RewriteDomainArgs): Promise<RewriteDomainResult> {
  try {
    const { writeFileSync } = await import('fs');
    const { join } = await import('path');
    const { getWorkspacePaths } = await import('../core/config.js');

    const paths = getWorkspacePaths(args.project);
    const domainPath = join(paths.tasksRoot, args.subproject, args.domain_file);

    writeFileSync(domainPath, args.new_content, 'utf-8');
    return { success: true, message: 'Domain file rewritten' };
  } catch (error) {
    return { success: false, message: `Failed to rewrite domain: ${error}` };
  }
}

export function formatRewriteDomainResult(result: RewriteDomainResult): string {
  return result.success ? `Domain rewritten successfully` : `Failed to rewrite domain: ${result.message}`;
}

interface AppendTaskArgs {
  project: string;
  subproject: string;
  domain_file: string;
  task_content: string;
}

interface AppendTaskResult {
  success: boolean;
  message: string;
}

export async function handleAppendTask(args: AppendTaskArgs): Promise<AppendTaskResult> {
  try {
    const { readFileSync, writeFileSync } = await import('fs');
    const { join } = await import('path');
    const { getWorkspacePaths } = await import('../core/config.js');

    const paths = getWorkspacePaths(args.project);
    const domainPath = join(paths.tasksRoot, args.subproject, args.domain_file);

    const content = readFileSync(domainPath, 'utf-8');
    const newContent = content + '\n' + args.task_content;

    writeFileSync(domainPath, newContent, 'utf-8');
    return { success: true, message: 'Task appended' };
  } catch (error) {
    return { success: false, message: `Failed to append task: ${error}` };
  }
}

export function formatAppendTaskResult(result: AppendTaskResult): string {
  return result.success ? `Task appended successfully` : `Failed to append task: ${result.message}`;
}

interface RemoveTaskArgs {
  project: string;
  subproject: string;
  domain_file: string;
  task_id: number;
}

interface RemoveTaskResult {
  success: boolean;
  message: string;
}

export async function handleRemoveTask(args: RemoveTaskArgs): Promise<RemoveTaskResult> {
  try {
    const { readFileSync, writeFileSync } = await import('fs');
    const { join } = await import('path');
    const { getWorkspacePaths } = await import('../core/config.js');

    const paths = getWorkspacePaths(args.project);
    const domainPath = join(paths.tasksRoot, args.subproject, args.domain_file);

    const content = readFileSync(domainPath, 'utf-8');
    const lines = content.split('\n');

    // Find the task header (try both # and ## formats)
    const taskHeader1 = `# Task ${String(args.task_id).padStart(3, '0')}:`;
    const taskHeader2 = `## Task ${String(args.task_id).padStart(3, '0')}:`;
    let startIndex = lines.findIndex(line => line.trim().startsWith(taskHeader1));
    if (startIndex === -1) {
      startIndex = lines.findIndex(line => line.trim().startsWith(taskHeader2));
    }

    if (startIndex === -1) {
      return { success: false, message: `Task ${args.task_id} not found` };
    }

    // Find the next task header or end
    let endIndex = lines.length;
    for (let i = startIndex + 1; i < lines.length; i++) {
      if (lines[i].startsWith('## Task ')) {
        endIndex = i;
        break;
      }
    }

    // Remove the task section
    lines.splice(startIndex, endIndex - startIndex);

    const newContent = lines.join('\n');
    writeFileSync(domainPath, newContent, 'utf-8');
    return { success: true, message: 'Task removed' };
  } catch (error) {
    return { success: false, message: `Failed to remove task: ${error}` };
  }
}

export function formatRemoveTaskResult(result: RemoveTaskResult): string {
  return result.success ? `Task removed successfully` : `Failed to remove task: ${result.message}`;
}
