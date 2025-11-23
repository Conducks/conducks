#!/usr/bin/env node
/**
 * CONDUCKS MCP Server - Intelligent Documentation Organizer
 * Hierarchical Jobs->Tasks system with numbered IDs for easy human reference
 */

// MCP SDK imports
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// Tool imports
import { handleCreateJob, formatCreateJobResult } from "./tools/create-job.js";
import { handleCompleteJob, formatCompleteJobResult } from "./tools/complete-job.js";
import { handleDeleteJob, formatDeleteJobResult } from "./tools/delete-job.js";
import { handleCreateTask, formatCreateTaskResult } from "./tools/create-task.js";
import { handleMoveTask, formatMoveTaskResult } from "./tools/move-task.js";
import { handleListActiveJobs } from "./tools/list-active-jobs.js";
import { handleListCompletedJobs } from "./tools/list-completed-jobs.js";
import { handleListJobsEnhanced } from "./tools/list-jobs-enhanced.js";
import { handleSmartInfo, formatSmartInfoResult } from "./tools/smart-info.js";
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
    description: "Create a new job with complete metadata for a specific workspace. This creates exactly ONE job - no automatic splitting occurs.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_path: { type: "string", description: "Workspace identifier (e.g., 'workspace1', 'my-project')" },
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
    description: "Mark job as completed and archive it in a specific workspace.",
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
    description: "Delete job and ALL associated task files permanently from a specific workspace.",
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
    description: "Create a new task markdown file for an existing job in a workspace-specific subproject.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_path: { type: "string", description: "Workspace identifier" },
        job_id: { type: "number", description: "Parent job ID" },
        title: { type: "string", description: "Task title" },
        description: { type: "string", description: "Task description" },
        priority: { type: "string", enum: ["high", "medium", "low", "critical"] },
        complexity: { type: "string", enum: ["simple", "medium", "complex"] },
        team: { type: "string", description: "Team responsible" },
        service: { type: "string", description: "Service name" },
        dependencies: { type: "array", items: { type: "string" }, description: "Task dependencies" },
        subproject: { type: "string", enum: ["w1", "w2", "w3"], description: "Subproject (defaults to w1)" }
      },
      required: ["workspace_path", "job_id", "title", "description"]
    }
  },
  {
    name: "move_task",
    description: "Move task between workflow folders within a workspace.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_path: { type: "string", description: "Workspace identifier" },
        subproject: { type: "string", enum: ["w1", "w2", "w3"], description: "Subproject name" },
        task_file: { type: "string", description: "Task filename" },
        target_folder: { type: "string", enum: ["to-do", "done-to-do", "analysis", "problem-solution"] },
        source_folder: { type: "string", enum: ["to-do", "done-to-do", "analysis", "problem-solution"] }
      },
      required: ["workspace_path", "subproject", "task_file", "target_folder"]
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
    name: "smart_info",
    description: "Get context-aware information about workspaces, system, project, subproject, or job.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_path: { type: "string", description: "Workspace identifier" },
        context: { type: "string", enum: ["workspace", "system", "project", "subproject", "job"] },
        project_name: { type: "string" },
        subproject_name: { type: "string" },
        job_id: { type: "number" }
      },
      required: ["workspace_path"]
    }
  },
  {
    name: "initialize_project_structure",
    description: "Initialize CONDUCKS project structure for a workspace.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_path: { type: "string", description: "Relative workspace path" },
        project_name: { type: "string" },
        auto_select: { type: "boolean" },
        include_subprojects: { type: "array", items: { type: "string" } }
      },
      required: ["workspace_path"]
    }
  },
  {
    name: "architecture_audit",
    description: "Audit repository structure for fragmentation and optimization opportunities.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_path: { type: "string" },
        depth: { type: "number" }
      },
      required: ["workspace_path"]
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
      case "create_job":
        const jobResult = await handleCreateJob(args as any);
        return { content: [{ type: "text", text: formatCreateJobResult(jobResult) }] };

      case "complete_job":
        const completeResult = await handleCompleteJob(args as any);
        return { content: [{ type: "text", text: formatCompleteJobResult(completeResult) }] };

      case "delete_job":
        const deleteResult = await handleDeleteJob(args as any);
        return { content: [{ type: "text", text: formatDeleteJobResult(deleteResult) }] };

      case "create_task":
        const taskResult = await handleCreateTask(args as any);
        return { content: [{ type: "text", text: formatCreateTaskResult(taskResult) }] };

      case "move_task":
        const moveResult = await handleMoveTask(args as any);
        return { content: [{ type: "text", text: formatMoveTaskResult(moveResult) }] };

      case "list_active_jobs":
        const activeResult = await handleListActiveJobs(args as any);
        return { content: [{ type: "text", text: activeResult.content[0].text }] };

      case "list_completed_jobs":
        const completedResult = await handleListCompletedJobs();
        return { content: [{ type: "text", text: completedResult.content[0].text }] };

      case "list_jobs_enhanced":
        const enhancedResult = await handleListJobsEnhanced(args as any);
        return { content: [{ type: "text", text: enhancedResult.content[0].text }] };

      case "smart_info":
        const infoResult = await handleSmartInfo(args as any);
        return { content: [{ type: "text", text: formatSmartInfoResult(infoResult) }] };

      case "initialize_project_structure":
        const initResult = await handleInitializeProjectStructure(args as any);
        return { content: [{ type: "text", text: formatInitResult(initResult) }] };

      case "architecture_audit":
        const auditResult = await handleArchitectureAudit(args as any);
        return { content: [{ type: "text", text: formatArchitectureAuditResult(auditResult) }] };

      // Domain CRUD tools would go here

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
