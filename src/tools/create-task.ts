import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import * as path from 'path';
import { SubTask } from '../core/types.js';
import { validateWorkspaceIdentifier } from '../core/config.js';

interface CreateTaskArgs {
  workspace_path?: string;
  job_id: number;
  title: string;
  description: string;
  priority?: 'high' | 'medium' | 'low' | 'critical';
  complexity?: 'simple' | 'medium' | 'complex';
  team?: string;
  service?: string;
  dependencies?: string[];
  subproject?: string;
  project?: string;
  folder?: string;
}

interface CreateTaskResult {
  success: boolean;
  message: string;
  task?: {
    id: string;
    title: string;
    filePath: string;
  };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .trim();
}

export function generateTaskMarkdown(task: SubTask, jobId: number, args: CreateTaskArgs): string {
  const now = new Date().toISOString();
  let md = `# Task ${task.id}: ${task.title}\n\n`;
  md += `**Job Reference:** ${jobId}\n`;
  md += `**Status:** ${task.status}\n`;
  md += `**Priority:** ${task.priority}\n`;
  md += `**Complexity:** ${task.complexity}\n`;
  md += `**Team:** ${task.team}\n`;
  md += `**Service:** ${task.service}\n`;
  md += `**Created:** ${now}\n`;
  md += `**Dependencies:** ${task.dependencies.length > 0 ? task.dependencies.join(', ') : 'None'}\n\n`;
  md += `## DESCRIPTION\n\n${args.description}\n\n`;
  md += `## NOTES\n\nAdd implementation notes or links here.\n`;
  return md;
}

export async function handleCreateTask(args: CreateTaskArgs): Promise<CreateTaskResult> {
  try {
    // Validate workspace identifier if provided
    if (args.workspace_path) {
      validateWorkspaceIdentifier(args.workspace_path);
    }

    const workspacePath = args.workspace_path || 'docs-organization';
    const storage = await import('../core/storage.js').then(m => m.loadCONDUCKSWorkspace(workspacePath));
    const job = storage.jobs.find(j => j.id === args.job_id);
    if (!job) {
      return { success: false, message: `Job ${args.job_id} not found` };
    }

    // Determine next task id (1-based within job)
    const existingIds = job.tasks.map(t => parseInt(t.id, 10)).filter(n => !isNaN(n));
    const nextId = existingIds.length === 0 ? 1 : Math.max(...existingIds) + 1;
    const taskIdStr = String(nextId).padStart(3, '0');

    const task: SubTask = {
      id: taskIdStr,
      title: args.title,
      status: 'active',
      priority: args.priority || 'medium',
      complexity: args.complexity || 'medium',
      team: args.team || 'platform',
      service: args.service || 'general',
      description: args.description,
      dependencies: args.dependencies || [],
      notes: '',
      lastUpdated: new Date().toISOString()
    };

    // Add task to job
    job.tasks.push(task);
    job.lastUpdated = new Date().toISOString();

    // Save updated job back to .toon file using workspace-specific save
    const saveJobForWorkspace = await import('../core/storage.js').then(m => m.saveJobForWorkspace);
    await saveJobForWorkspace(job, workspacePath, false);

    const subproject = args.subproject;
    const project = args.project || ''; // Use provided project or default to empty

    // Import getWorkspacePaths dynamically to avoid circular dependencies if any
    const { getWorkspacePaths } = await import('../core/config.js');
    const paths = getWorkspacePaths(workspacePath, project);

    const folder = args.folder || 'to-do';

    // Support both single-project (no subproject) and multi-project (with subproject) modes
    let targetDir: string;
    let actualSubprojectPath = '';

    if (subproject) {
      // Multi-project mode: use subproject directory
      actualSubprojectPath = (subproject === workspacePath) ? '' : subproject;
      targetDir = paths.getSubprojectDir(actualSubprojectPath, folder);
    } else {
      // Single-project mode: put tasks directly in workspace root
      targetDir = join(paths.tasksRoot, folder);
    }

    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    const slug = slugify(args.title);
    const fileName = `task_${taskIdStr}_${slug}.md`;
    const filePath = join(targetDir, fileName);
    const markdown = generateTaskMarkdown(task, job.id, args);
    writeFileSync(filePath, markdown, 'utf-8');

    return {
      success: true,
      message: `Created task ${taskIdStr} for job ${job.id} in folder ${folder}`,
      task: {
        id: taskIdStr,
        title: args.title,
        filePath: `storage/${workspacePath}/${actualSubprojectPath ? actualSubprojectPath + '/' : ''}${folder}/${fileName}`
      }
    };
  } catch (error) {
    return { success: false, message: `Failed to create task: ${error}` };
  }
}

export function formatCreateTaskResult(result: CreateTaskResult): string {
  if (!result.success) return `task_creation_failed: "${result.message}"`;
  return `task_created:\n  id: ${result.task?.id}\n  title: "${result.task?.title}"\n  file: ${result.task?.filePath}\n  next_action: "edit task file or add more tasks"`;
}

import { Tool } from '../core/tool-registry.js';

export const createTaskTool: Tool<CreateTaskArgs> = {
  name: "create_task",
  description: "Step 3a: Add a SINGLE task to an existing job. **Required for tracking work.** Use `batch_create_tasks` for bulk creation.",
  inputSchema: {
    type: "object",
    properties: {
      workspace_path: { type: "string", description: "Workspace identifier (optional, defaults to 'docs-organization')" },
      job_id: { type: "number", description: "Parent job ID" },
      title: { type: "string", description: "Task title" },
      description: { type: "string", description: "Task description" },
      priority: { type: "string", enum: ["high", "medium", "low", "critical"] },
      complexity: { type: "string", enum: ["simple", "medium", "complex"] },
      team: { type: "string", description: "Team responsible" },
      service: { type: "string", description: "Service name" },
      dependencies: { type: "array", items: { type: "string" }, description: "Task dependencies" },
      subproject: { type: "string", description: "Subproject name (e.g., 'conducks', 'website', 'DOCS')" },
      folder: { type: "string", description: "Folder for task file (e.g., 'to-do', 'analysis', 'problem-solution'; defaults to 'to-do')" }
    },
    required: ["job_id", "title", "description"]
  },
  handler: handleCreateTask,
  formatter: formatCreateTaskResult
};
