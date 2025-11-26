
import { writeFileSync } from 'fs';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { SubTask } from '../core/types.js';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .trim();
}

interface BatchCreateTasksArgs {
  workspace_path: string;
  job_id: number;
  tasks: {
    title: string;
    description: string;
    priority?: 'high' | 'medium' | 'low' | 'critical';
    complexity?: 'simple' | 'medium' | 'complex';
    team?: string;
    service?: string;
    folder?: string; // to-do, analysis, etc.
  }[];
  subproject?: string;
}

interface BatchCreateTasksResult {
  success: boolean;
  message: string;
  tasks?: { id: string; title: string; filePath: string }[];
}

export async function handleBatchCreateTasks(args: BatchCreateTasksArgs): Promise<BatchCreateTasksResult> {
  try {
    const workspacePath = args.workspace_path || 'docs-organization';
    const storage = await import('../core/storage.js').then(m => m.loadCONDUCKSWorkspace(workspacePath));
    const job = storage.jobs.find(j => j.id === args.job_id);
    if (!job) {
      return { success: false, message: `Job ${args.job_id} not found` };
    }

    // Determine next task ids
    const existingIds = job.tasks.map(t => parseInt(t.id, 10)).filter(n => !isNaN(n));
    let nextId = existingIds.length === 0 ? 1 : Math.max(...existingIds) + 1;

    const subproject = args.subproject || 'w1';
    const project = 'ProjectX'; // TODO: get from args or job

    // Import getWorkspacePaths and handleCreateTask
    const { getWorkspacePaths } = await import('../core/config.js');
    const { generateTaskMarkdown } = await import('./create-task.js');
    const paths = getWorkspacePaths(workspacePath, project);

    const createdTasks: { id: string; title: string; filePath: string }[] = [];

    for (const taskData of args.tasks) {
      const taskIdStr = String(nextId).padStart(3, '0');

      const task: SubTask = {
        id: taskIdStr,
        title: taskData.title,
        status: 'active',
        priority: taskData.priority || 'medium',
        complexity: taskData.complexity || 'medium',
        team: taskData.team || 'platform',
        service: taskData.service || 'general',
        description: taskData.description,
        dependencies: [],
        notes: '',
        lastUpdated: new Date().toISOString()
      };

      // Add task to job
      job.tasks.push(task);
      job.lastUpdated = new Date().toISOString();

      // Create markdown file
      const folder = taskData.folder || 'to-do';
      const todoDir = paths.getSubprojectDir(subproject, folder);

      if (!existsSync(todoDir)) {
        mkdirSync(todoDir, { recursive: true });
      }

      const slug = slugify(taskData.title);
      const fileName = `task_${taskIdStr}_${slug}.md`;
      const filePath = join(todoDir, fileName);
      const markdown = generateTaskMarkdown(task, job.id, {
        ...taskData,
        workspace_path: workspacePath,
        job_id: args.job_id,
        subproject: subproject
      } as any); // TODO: proper interface
      writeFileSync(filePath, markdown, 'utf-8');

      createdTasks.push({
        id: taskIdStr,
        title: taskData.title,
        filePath: `storage/${workspacePath}/${project}/${subproject}/${folder}/${fileName}`
      });

      nextId++;
    }

    // Save updated job
    const saveJobForWorkspace = await import('../core/storage.js').then(m => m.saveJobForWorkspace);
    await saveJobForWorkspace(job, workspacePath, false);

    return {
      success: true,
      message: `Created ${createdTasks.length} tasks for job ${job.id}`,
      tasks: createdTasks
    };
  } catch (error) {
    return { success: false, message: `Failed to batch create tasks: ${error}` };
  }
}

export function formatBatchCreateTasksResult(result: BatchCreateTasksResult): string {
  if (!result.success) return `BATCH TASK CREATION FAILED\n\n${result.message}`;
  return `BATCH TASK CREATION\n\nCreated ${result.tasks?.length} tasks:\n${result.tasks?.map(t => `- ${t.id}: ${t.title}\n  File: ${t.filePath}`).join('\n')}\n\nNext: edit tasks or add more tasks.`;
}
