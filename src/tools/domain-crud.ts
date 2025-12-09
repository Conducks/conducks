// Domain CRUD operations for editing task files and domain files

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

interface EditTaskArgs {
  project: string;
  subproject: string;
  folder: string; // 'to-do', 'done-to-do', 'analysis', 'problem-solution'
  domain_file: string; // e.g., 'task_001_example.md' - include .md extension
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

    const paths = getWorkspacePaths(args.project, ''); // Use empty project to avoid double-directory
    const domainDir = paths.getSubprojectDir(args.subproject, args.folder);
    const domainPath = join(domainDir, args.domain_file);

    let content = readFileSync(domainPath, 'utf-8');
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

    // Find the next task header or end of file to define the block
    let endIndex = lines.length;
    for (let i = startIndex + 1; i < lines.length; i++) {
      if (lines[i].startsWith('# Task ') || lines[i].startsWith('## Task ')) {
        endIndex = i;
        break;
      }
    }

    // Extract the task block
    const taskBlockLines = lines.slice(startIndex, endIndex);
    let taskBlock = taskBlockLines.join('\n');

    // Apply updates ONLY to this block
    if (args.updates.status) {
      taskBlock = taskBlock.replace(/\*\*Status:\*\* [^\n]*/, `**Status:** ${args.updates.status}`);
      taskBlock = taskBlock.replace(/Status: [^\n]*/, `Status: ${args.updates.status}`);
    }
    if (args.updates.team) {
      taskBlock = taskBlock.replace(/\*\*Team:\*\* [^\n]*/, `**Team:** ${args.updates.team}`);
      taskBlock = taskBlock.replace(/Team: [^\n]*/, `Team: ${args.updates.team}`);
    }
    if (args.updates.complexity) {
      taskBlock = taskBlock.replace(/\*\*Complexity:\*\* [^\n]*/, `**Complexity:** ${args.updates.complexity}`);
      taskBlock = taskBlock.replace(/Complexity: [^\n]*/, `Complexity: ${args.updates.complexity}`);
    }
    if (args.updates.description) {
      taskBlock = taskBlock.replace(/Desc: [^\n]*/, `Desc: ${args.updates.description}`);
    }

    // Put the updated block back into the lines
    const updatedBlockLines = taskBlock.split('\n');
    lines.splice(startIndex, endIndex - startIndex, ...updatedBlockLines);

    writeFileSync(domainPath, lines.join('\n'), 'utf-8');
    return { success: true, message: 'Task attributes updated' };
  } catch (error) {
    return { success: false, message: `Failed to edit task: ${error}` };
  }
}

export function formatEditTaskResult(result: EditTaskResult): string {
  if (!result.success) return `task_edit_failed: "${result.message}"`;
  return `task_updated:\n  message: "${result.message}"`;
}

interface ReplaceLinesArgs {
  project: string;
  subproject: string;
  folder: string; // 'to-do', 'done-to-do', 'analysis', 'problem-solution'
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

    const paths = getWorkspacePaths(args.project, ''); // Use empty project to avoid double-directory
    const domainDir = paths.getSubprojectDir(args.subproject, args.folder);
    const domainPath = join(domainDir, args.domain_file);

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
  if (!result.success) return `lines_replace_failed: "${result.message}"`;
  return `lines_replaced:\n  message: "${result.message}"`;
}

interface RewriteDomainArgs {
  project: string;
  subproject: string;
  folder: string; // 'to-do', 'done-to-do', 'analysis', 'problem-solution'
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

    const paths = getWorkspacePaths(args.project, ''); // Use empty project to avoid double-directory
    const domainDir = paths.getSubprojectDir(args.subproject, args.folder);
    const domainPath = join(domainDir, args.domain_file);

    writeFileSync(domainPath, args.new_content, 'utf-8');
    return { success: true, message: 'Domain file rewritten' };
  } catch (error) {
    return { success: false, message: `Failed to rewrite domain: ${error}` };
  }
}

export function formatRewriteDomainResult(result: RewriteDomainResult): string {
  if (!result.success) return `domain_rewrite_failed: "${result.message}"`;
  return `domain_rewritten:\n  message: "${result.message}"`;
}

interface AppendTaskArgs {
  project: string;
  subproject: string;
  folder: string; // 'to-do', 'done-to-do', 'analysis', 'problem-solution'
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

    const paths = getWorkspacePaths(args.project, ''); // Use empty project to avoid double-directory
    const domainDir = paths.getSubprojectDir(args.subproject, args.folder);
    const domainPath = join(domainDir, args.domain_file);

    const content = readFileSync(domainPath, 'utf-8');
    const newContent = content + '\n' + args.task_content;

    writeFileSync(domainPath, newContent, 'utf-8');
    return { success: true, message: 'Task appended' };
  } catch (error) {
    return { success: false, message: `Failed to append task: ${error}` };
  }
}

export function formatAppendTaskResult(result: AppendTaskResult): string {
  if (!result.success) return `task_append_failed: "${result.message}"`;
  return `task_appended:\n  message: "${result.message}"`;
}

interface RemoveTaskArgs {
  project: string;
  subproject: string;
  folder: string; // 'to-do', 'done-to-do', 'analysis', 'problem-solution'
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

    const paths = getWorkspacePaths(args.project, ''); // Use empty project to avoid double-directory
    const domainDir = paths.getSubprojectDir(args.subproject, args.folder);
    const domainPath = join(domainDir, args.domain_file);

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
  if (!result.success) return `task_remove_failed: "${result.message}"`;
  return `task_removed:\n  message: "${result.message}"`;
}

import { Tool } from '../core/tool-registry.js';

export const editTaskTool: Tool<EditTaskArgs> = {
  name: "edit_task",
  description: "Modify an existing task's attributes. Supported updates: `status`, `team`, `complexity`, `description`.",
  inputSchema: {
    type: "object",
    properties: {
      project: { type: "string" },
      subproject: { type: "string" },
      folder: { type: "string", enum: ["to-do", "done-to-do", "analysis", "problem-solution"], description: "Folder containing the file" },
      domain_file: { type: "string", description: "Task filename (e.g., 'task_001_example.md' - include .md extension)" },
      task_id: { type: "number" },
      updates: {
        type: "object",
        properties: {
          status: { type: "string" },
          team: { type: "string" },
          complexity: { type: "string" },
          description: { type: "string" }
        }
      }
    },
    required: ["project", "subproject", "folder", "domain_file", "task_id", "updates"]
  },
  handler: handleEditTask,
  formatter: formatEditTaskResult
};

export const replaceLinesTool: Tool<ReplaceLinesArgs> = {
  name: "replace_lines",
  description: "Replace a specific range of lines in a domain file. **IMPORTANT: Line numbers are 1-based.**",
  inputSchema: {
    type: "object",
    properties: {
      project: { type: "string" },
      subproject: { type: "string" },
      folder: { type: "string", enum: ["to-do", "done-to-do", "analysis", "problem-solution"], description: "Folder containing the file" },
      domain_file: { type: "string" },
      start_line: { type: "number" },
      end_line: { type: "number" },
      replacement_text: { type: "string" }
    },
    required: ["project", "subproject", "folder", "domain_file", "start_line", "end_line", "replacement_text"]
  },
  handler: handleReplaceLines,
  formatter: formatReplaceLinesResult
};

export const rewriteDomainTool: Tool<RewriteDomainArgs> = {
  name: "rewrite_domain",
  description: "Rewrite an entire domain file with new content. **WARNING: This overwrites the entire file.**",
  inputSchema: {
    type: "object",
    properties: {
      project: { type: "string" },
      subproject: { type: "string" },
      folder: { type: "string", enum: ["to-do", "done-to-do", "analysis", "problem-solution"], description: "Folder containing the file" },
      domain_file: { type: "string" },
      new_content: { type: "string" }
    },
    required: ["project", "subproject", "folder", "domain_file", "new_content"]
  },
  handler: handleRewriteDomain,
  formatter: formatRewriteDomainResult
};

export const appendTaskTool: Tool<AppendTaskArgs> = {
  name: "append_task",
  description: "Append a new task to the end of a domain file.",
  inputSchema: {
    type: "object",
    properties: {
      project: { type: "string" },
      subproject: { type: "string" },
      folder: { type: "string", enum: ["to-do", "done-to-do", "analysis", "problem-solution"], description: "Folder containing the file" },
      domain_file: { type: "string" },
      task_content: { type: "string" }
    },
    required: ["project", "subproject", "folder", "domain_file", "task_content"]
  },
  handler: handleAppendTask,
  formatter: formatAppendTaskResult
};

export const removeTaskTool: Tool<RemoveTaskArgs> = {
  name: "remove_task",
  description: "Remove a task from a domain file.",
  inputSchema: {
    type: "object",
    properties: {
      project: { type: "string" },
      subproject: { type: "string" },
      folder: { type: "string", enum: ["to-do", "done-to-do", "analysis", "problem-solution"], description: "Folder containing the file" },
      domain_file: { type: "string" },
      task_id: { type: "number" }
    },
    required: ["project", "subproject", "folder", "domain_file", "task_id"]
  },
  handler: handleRemoveTask,
  formatter: formatRemoveTaskResult
};
