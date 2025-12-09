
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

    // Support both single-project and multi-project modes
    let subproject: string | undefined = args.subproject;

    // Extract subproject from first task if not specified at top level
    if (!subproject && args.tasks.length > 0) {
      const firstTaskSubproject = (args.tasks[0] as any).subproject;
      if (firstTaskSubproject) {
        subproject = firstTaskSubproject;
        // Remove subproject from individual tasks for clean processing
        args.tasks.forEach(task => {
          if ((task as any).subproject) delete (task as any).subproject;
        });
      }
    }

    // For single-project mode, subproject is optional (defaults to workspace root)
    const project = ''; // No hardcoded project - use workspace root

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

      // Create markdown file - support both single and multi-project modes
      const folder = taskData.folder || 'to-do';
      let todoDir: string;

      if (subproject) {
        // Multi-project mode: use subproject directory
        const actualSubprojectPath = (subproject === workspacePath) ? '' : subproject;
        todoDir = paths.getSubprojectDir(actualSubprojectPath, folder);
      } else {
        // Single-project mode: put tasks directly in workspace root
        todoDir = join(paths.tasksRoot, folder);
      }

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

      // Prevent double-directory issue when subproject name matches workspace name
      const actualSubprojectPath = (subproject === workspacePath) ? '' : subproject;
      createdTasks.push({
        id: taskIdStr,
        title: taskData.title,
        filePath: `storage/${workspacePath}/${actualSubprojectPath ? actualSubprojectPath + '/' : ''}${folder}/${fileName}`
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
  if (!result.success) return `batch_task_creation_failed: "${result.message}"`;

  let output = `tasks_created[${result.tasks?.length}]:\n`;
  result.tasks?.forEach(task => {
    output += `  - id: ${task.id}\n`;
    output += `    title: "${task.title}"\n`;
    output += `    file: ${task.filePath}\n`;
  });
  output += `next_action: "edit tasks or add more tasks"`;

  return output;
}

import { Tool } from '../core/tool-registry.js';

export const batchCreateTasksTool: Tool<BatchCreateTasksArgs> = {
  name: "batch_create_tasks",
  description: "Step 3b: Add MULTIPLE tasks to an existing job at once. Efficient for initial job population.\\n\\n**BEFORE calling this tool, you SHOULD:**\\n1. Ask the user what tasks they want to create\\n2. Optionally: Analyze the codebase related to the job domain\\n3. Present a suggested task list to the user for confirmation\\n4. Only create tasks after user approval\\n\\nAfter creating tasks, offer to analyze the codebase and create detailed TODO.md files for each task.",
  inputSchema: {
    type: "object",
    properties: {
      workspace_path: { type: "string", description: "Workspace identifier" },
      job_id: { type: "number", description: "Parent job ID" },
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            priority: { type: "string", enum: ["high", "medium", "low", "critical"] },
            complexity: { type: "string", enum: ["simple", "medium", "complex"] },
            team: { type: "string" },
            service: { type: "string" },
            dependencies: { type: "array", items: { type: "string" } },
            subproject: { type: "string" },
            folder: { type: "string" }
          },
          required: ["title", "description"]
        }
      }
    },
    required: ["workspace_path", "job_id", "tasks"]
  },
  handler: handleBatchCreateTasks,
  formatter: formatBatchCreateTasksResult
};
