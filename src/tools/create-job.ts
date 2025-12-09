import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadCONDUCKSWorkspace, saveJobForWorkspace, getNextJobIdForWorkspace } from '../core/storage.js';
import { validateWorkspaceIdentifier } from '../core/config.js';
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
    // Validate workspace identifier
    validateWorkspaceIdentifier(args.workspace_path);

    const { workspace_path, name, description, domain, dependencies } = args;

    // Create single job - no automatic splitting
    const jobId = await getNextJobIdForWorkspace(workspace_path);
    const slug = slugify(name);

    const job: Job = {
      id: jobId,
      title: args.name,
      domain: args.domain || (args.dependencies && args.dependencies.length > 0 ? args.dependencies[0] : 'general'),
      description: args.description,
      priority: args.priority, // Add priority field
      objectives: args.objectives, // Add objectives
      tags: args.tags, // Add tags
      risk_assessment: args.risk_assessment, // Add risk assessment
      estimated_effort: args.estimated_effort, // Add estimated effort
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
    return `job_creation_failed: "${result.message}"`;
  }

  let output = `job_created:\n`;

  for (const job of result.jobs) {
    output += `  id: ${job.id}\n`;
    output += `  title: "${job.name}"\n`;
    output += `  file: ${job.filePath}\n`;
  }

  output += `message: "${result.message}"\n`;
  output += `next_steps[3]:\n`;
  output += `  - "create_task: add task files"\n`;
  output += `  - "list_jobs_enhanced: get overview"\n`;
  output += `  - "complete_job: when all tasks done"`;

  return output;
}

import { Tool } from '../core/tool-registry.js';

export const createJobTool: Tool<CreateJobArgs> = {
  name: "create_job",
  description: "Step 2: Create a new job container (metadata only). **MUST run initialize_project_structure first.**\\n\\n**CRITICAL - BEFORE calling this tool, you MUST ask the user these questions:**\\n1. What is the main goal/objective of this job?\\n2. What specific outcomes are expected?\\n3. What tasks do you envision for this job?\\n4. Should we analyze the codebase to suggest additional tasks?\\n\\nOnly call this tool AFTER the user has answered these questions. Use their responses to populate the description, objectives, and other fields accurately.\\n\\nThis creates the job ID and folder, but NO tasks. Use `create_task` or `batch_create_tasks` next. DO NOT USE FULL PATHS for workspace_path; use workspace identifier names only.",
  inputSchema: {
    type: "object",
    properties: {
      workspace_path: { type: "string", description: "Workspace identifier name (e.g., 'workspace1', 'my-project')" },
      name: { type: "string", description: "Job name (concise, descriptive)" },
      description: { type: "string", description: "Detailed objective describing complete success criteria" },
      domain: { type: "string", description: "Technical domain (e.g., 'authentication', 'database')" },
      priority: { type: "string", enum: ["low", "medium", "high"] },
      estimated_effort: { type: "string", description: "Time estimate (e.g., '2 weeks')" },
      objectives: { type: "array", items: { type: "string" }, description: "List of specific measurable objectives" },
      dependencies: { type: "array", items: { type: "string" }, description: "Cross-service dependencies" },
      tags: { type: "array", items: { type: "string" }, description: "Categorization tags" },
      risk_assessment: { type: "string", description: "Known risks and mitigation strategies" }
    },
    required: ["workspace_path", "name", "description"]
  },
  handler: handleCreateJob,
  formatter: formatCreateJobResult
};
