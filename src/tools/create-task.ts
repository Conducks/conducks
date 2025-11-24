import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import * as path from 'path';
import { SubTask } from '../core/types.js';

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
  subproject?: 'w1' | 'w2' | 'w3';
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

function generateTaskMarkdown(task: SubTask, jobId: number, args: CreateTaskArgs): string {
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

    // Create markdown file in ProjectX/w1/to-do/ (for now keep global for migration compatibility)
    const subproject = args.subproject || 'w1';
    const storageRoot = process.env.CONDUCKS_STORAGE_ROOT || join(process.cwd(), 'storage');
    const projectRoot = join(storageRoot, workspacePath, 'ProjectX');
    const todoDir = join(projectRoot, subproject, 'to-do');

    if (!existsSync(todoDir)) {
      mkdirSync(todoDir, { recursive: true });
    }

    const slug = slugify(args.title);
    const fileName = `task_${taskIdStr}_${slug}.md`;
    const filePath = join(todoDir, fileName);
    const markdown = generateTaskMarkdown(task, job.id, args);
    writeFileSync(filePath, markdown, 'utf-8');

    return {
      success: true,
      message: `Created task ${taskIdStr} for job ${job.id}`,
      task: {
        id: taskIdStr,
        title: args.title,
        filePath: `storage/${workspacePath}/ProjectX/${subproject}/to-do/${fileName}`
      }
    };
  } catch (error) {
    return { success: false, message: `Failed to create task: ${error}` };
  }
}

export function formatCreateTaskResult(result: CreateTaskResult): string {
  if (!result.success) return `TASK CREATION FAILED\n\n${result.message}`;
  return `TASK CREATED\n\nTask ${result.task?.id}: ${result.task?.title}\nFile: ${result.task?.filePath}\n\nNext: edit task file or add more tasks.`;
}
