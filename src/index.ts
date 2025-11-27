
// MCP SDK imports
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// Tool imports
import { logToolCall } from "./dashboard/logger.js";
import { handleCreateJob, formatCreateJobResult } from "./tools/create-job.js";
import { handleCompleteJob, formatCompleteJobResult } from "./tools/complete-job.js";
import { handleDeleteJob, formatDeleteJobResult } from "./tools/delete-job.js";
import { handleCreateTask, formatCreateTaskResult } from "./tools/create-task.js";
import { handleBatchCreateTasks, formatBatchCreateTasksResult } from "./tools/batch-create-tasks.js";
import { handleMoveTask, formatMoveTaskResult } from "./tools/move-task.js";
import { handleListActiveJobs } from "./tools/list-active-jobs.js";
import { handleListCompletedJobs } from "./tools/list-completed-jobs.js";
import { handleListJobsEnhanced } from "./tools/list-jobs-enhanced.js";
import { handleInitializeProjectStructure, formatInitResult } from "./tools/initialize-project-structure.js";
import { handleArchitectureAudit, formatArchitectureAuditResult } from "./tools/architecture-audit.js";
import { handleEditTask, formatEditTaskResult, handleReplaceLines, formatReplaceLinesResult, handleRewriteDomain, formatRewriteDomainResult, handleAppendTask, formatAppendTaskResult, handleRemoveTask, formatRemoveTaskResult } from "./tools/domain-crud.js";

// Server configuration
const server = new Server(
  {
    name: "conducks",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions for MCP discovery with workspace isolation
const TOOLS = [
  {
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
    }
  },
  {
    name: "complete_job",
    description: "Mark a job as completed, move it to the archive, and record completion notes. **Use when all tasks are done.**",
    inputSchema: {
      type: "object",
      properties: {
        workspace_path: { type: "string", description: "Workspace identifier" },
        job_id: { type: "number", description: "Job ID to complete" },
        completion_notes: { type: "string", description: "Optional completion notes" }
      },
      required: ["workspace_path", "job_id"]
    }
  },
  {
    name: "delete_job",
    description: "Permanently delete a job and ALL its task files. **WARNING: IRREVERSIBLE.** Use with caution.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_path: { type: "string", description: "Workspace identifier" },
        job_id: { type: "number", description: "Job ID to delete" },
        confirm_deletion: { type: "boolean", description: "Must be true to proceed" }
      },
      required: ["workspace_path", "job_id", "confirm_deletion"]
    }
  },
  {
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
    }
  },
  {
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
    }
  },
  {
    name: "move_task",
    description: "Transition a task between workflow stages (e.g., `to-do` -> `analysis` -> `done-to-do`).",
    inputSchema: {
      type: "object",
      properties: {
        workspace_path: { type: "string", description: "Workspace identifier (optional, defaults to 'default')" },
        project: { type: "string", description: "Project name (optional, defaults to 'ProjectX')" },
        subproject: { type: "string", description: "Subproject name" },
        task_file: { type: "string", description: "Task filename" },
        target_folder: { type: "string", enum: ["to-do", "done-to-do", "analysis", "problem-solution"], description: "Target folder" },
        source_folder: { type: "string", enum: ["to-do", "done-to-do", "analysis", "problem-solution"], description: "Optional source folder (auto-detected if not provided)" }
      },
      required: ["subproject", "task_file", "target_folder"]
    }
  },
  {
    name: "list_active_jobs",
    description: "List all active jobs with progress status for a specific workspace.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_path: { type: "string", description: "Workspace identifier" }
      },
      required: ["workspace_path"]
    }
  },
  {
    name: "list_completed_jobs",
    description: "List all completed jobs for a specific workspace.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_path: { type: "string", description: "Workspace identifier" }
      },
      required: ["workspace_path"]
    }
  },
  {
    name: "list_jobs_enhanced",
    description: "Get detailed information about a specific job including all tasks from a workspace.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_path: { type: "string", description: "Workspace identifier" },
        job_id: { type: "number", description: "Job ID for detailed view" }
      },
      required: ["workspace_path", "job_id"]
    }
  },
  {
    name: "initialize_project_structure",
    description: "**STEP 1 (REQUIRED):** Initialize workspace and get system status. **MUST BE RUN BEFORE ANY OTHER TOOL.** Safe to call anytime to check status.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: { type: "string", description: "Full absolute filesystem path to workspace root (REQUIRED for accurate structure detection). Example: '/Users/username/my-project' or '/home/user/project'" },
        project_name: { type: "string", description: "Optional: Override detected project name" },
        auto_select: { type: "boolean", description: "Optional: Automatically include all detected subprojects" },
        include_subprojects: { type: "array", items: { type: "string" }, description: "Optional: Filter to only include these specific subproject names if auto_select=false" }
      },
      required: ["project_path"]
    }
  },
  {
    name: "architecture_audit",
    description: "Audit repository structure for fragmentation and optimization opportunities. Returns a file tree analysis.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_path: { type: "string" },
        depth: { type: "number" }
      },
      required: ["workspace_path"]
    }
  },
  {
    name: "edit_task",
    description: "Modify an existing task's attributes. Supported updates: `status`, `team`, `complexity`, `description`.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string" },
        subproject: { type: "string" },
        folder: { type: "string", enum: ["to-do", "done-to-do", "analysis", "problem-solution"], description: "Folder containing the file" },
        domain_file: { type: "string" },
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
    }
  },
  {
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
    }
  },
  {
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
    }
  },
  {
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
    }
  },
  {
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
    }
  }
];

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_job": {
        const jobResult = await handleCreateJob(args as any);
        const response = { content: [{ type: "text", text: formatCreateJobResult(jobResult) }] };
        logToolCall("create_job", args, response);
        return response;
      }

      case "complete_job": {
        const completeResult = await handleCompleteJob(args as any);
        const response = { content: [{ type: "text", text: formatCompleteJobResult(completeResult) }] };
        logToolCall("complete_job", args, response);
        return response;
      }

      case "delete_job": {
        const deleteResult = await handleDeleteJob(args as any);
        const response = { content: [{ type: "text", text: formatDeleteJobResult(deleteResult) }] };
        logToolCall("delete_job", args, response);
        return response;
      }

      case "create_task": {
        const taskResult = await handleCreateTask(args as any);
        const response = { content: [{ type: "text", text: formatCreateTaskResult(taskResult) }] };
        logToolCall("create_task", args, response);
        return response;
      }

      case "batch_create_tasks": {
        const batchResult = await handleBatchCreateTasks(args as any);
        const response = { content: [{ type: "text", text: formatBatchCreateTasksResult(batchResult) }] };
        logToolCall("batch_create_tasks", args, response);
        return response;
      }

      case "move_task": {
        const moveResult = await handleMoveTask(args as any);
        const response = { content: [{ type: "text", text: formatMoveTaskResult(moveResult) }] };
        logToolCall("move_task", args, response);
        return response;
      }

      case "list_active_jobs": {
        const activeResult = await handleListActiveJobs(args as any);
        const response = { content: [{ type: "text", text: activeResult.content[0].text }] };
        logToolCall("list_active_jobs", args, response);
        return response;
      }

      case "list_completed_jobs": {
        const completedResult = await handleListCompletedJobs(args as any);
        const response = { content: [{ type: "text", text: completedResult.content[0].text }] };
        logToolCall("list_completed_jobs", args, response);
        return response;
      }

      case "list_jobs_enhanced": {
        const enhancedResult = await handleListJobsEnhanced(args as any);
        const response = { content: [{ type: "text", text: enhancedResult.content[0].text }] };
        logToolCall("list_jobs_enhanced", args, response);
        return response;
      }

      case "initialize_project_structure": {
        // Map MCP parameter name to handler parameter name
        const handlerArgs = {
          ...args,
          workspace_path: (args as any).project_path
        };
        const initResult = await handleInitializeProjectStructure(handlerArgs);
        const response = { content: [{ type: "text", text: formatInitResult(initResult) }] };
        logToolCall("initialize_project_structure", args, response);
        return response;
      }

      case "architecture_audit": {
        const auditResult = await handleArchitectureAudit(args as any);
        const response = { content: [{ type: "text", text: formatArchitectureAuditResult(auditResult) }] };
        logToolCall("architecture_audit", args, response);
        return response;
      }

      case "edit_task": {
        const editResult = await handleEditTask(args as any);
        const response = { content: [{ type: "text", text: formatEditTaskResult(editResult) }] };
        logToolCall("edit_task", args, response);
        return response;
      }

      case "replace_lines": {
        const replaceResult = await handleReplaceLines(args as any);
        const response = { content: [{ type: "text", text: formatReplaceLinesResult(replaceResult) }] };
        logToolCall("replace_lines", args, response);
        return response;
      }

      case "rewrite_domain": {
        const rewriteResult = await handleRewriteDomain(args as any);
        const response = { content: [{ type: "text", text: formatRewriteDomainResult(rewriteResult) }] };
        logToolCall("rewrite_domain", args, response);
        return response;
      }

      case "append_task": {
        const appendResult = await handleAppendTask(args as any);
        const response = { content: [{ type: "text", text: formatAppendTaskResult(appendResult) }] };
        logToolCall("append_task", args, response);
        return response;
      }

      case "remove_task": {
        const removeResult = await handleRemoveTask(args as any);
        const response = { content: [{ type: "text", text: formatRemoveTaskResult(removeResult) }] };
        logToolCall("remove_task", args, response);
        return response;
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{ type: "text", text: `❌ Error: ${(error as Error).message}` }],
      isError: true
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("CONDUCKS MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
