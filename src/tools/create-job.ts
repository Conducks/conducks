import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadCONDUCKSWorkspace, saveJobForWorkspace, getNextJobIdForWorkspace } from '../core/storage.js';
import { Job } from '../core/types.js';

interface CreateJobArgs {
  workspace_path: string;
  name: string;
  description: string;
  domain?: string;
  priority?: 'low' | 'medium' | 'high';
  estimated_effort?: string;
  objectives?: string[];
  dependencies?: string[];
  tags?: string[];
  risk_assessment?: string;
}

interface CreateJobResult {
  success: boolean;
  jobs: Array<{
    id: number;
    name: string;
    filePath: string;
  }>;
  message: string;
}

/**
 * Slugify job name for filename
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .trim();
}

/**
 * Creates job .toon file in workspace-specific jobs/to-do/
 */
export async function handleCreateJob(args: CreateJobArgs): Promise<CreateJobResult> {
  try {
    const { workspace_path, name, description, domain, dependencies } = args;

    // Create single job - no automatic splitting
    const jobId = await getNextJobIdForWorkspace(workspace_path);
    const slug = slugify(name);

    const job: Job = {
      id: jobId,
      title: args.name,
      domain: args.domain || (args.dependencies && args.dependencies.length > 0 ? args.dependencies[0] : 'general'),
      description: args.description,
      tasks: [],
      crossServiceLinks: args.dependencies || [],
      created: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };

    await saveJobForWorkspace(job, workspace_path, false);

    const filename = `${String(jobId).padStart(3, '0')}_${slug}.toon`;

    return {
      success: true,
      jobs: [{
        id: jobId,
        name: args.name,
        filePath: `jobs/to-do/${filename}`
      }],
      message: `Created job. Tasks can be added separately using create_task.`
    };

  } catch (error) {
    return {
      success: false,
      jobs: [],
      message: `Failed to create job: ${error}`
    };
  }
}

/**
 * Format result for MCP response (plain text)
 */
export function formatCreateJobResult(result: CreateJobResult): string {
  if (!result.success) {
    return `JOB CREATION FAILED\n\n${result.message}`;
  }
  
  let output = `JOB(S) CREATED\n\n`;
  
  for (const job of result.jobs) {
    output += `Job ${String(job.id).padStart(3, '0')}: ${job.name}\n`;
    output += `File: ${job.filePath}\n\n`;
  }
  
  output += `${result.message}\n\n`;
  output += `Next steps:\n`;
  output += `1. Use create_task to add task files\n`;
  output += `2. Use list_jobs_enhanced for overview\n`;
  output += `3. Use complete_job when all tasks are completed\n`;
  
  return output;
}
