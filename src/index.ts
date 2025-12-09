
// MCP SDK imports
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Core imports
import { ToolRegistry } from "./core/tool-registry.js";

// Tool imports
import { createJobTool } from "./tools/create-job.js";
import { completeJobTool } from "./tools/complete-job.js";
import { deleteJobTool } from "./tools/delete-job.js";
import { createTaskTool } from "./tools/create-task.js";
import { batchCreateTasksTool } from "./tools/batch-create-tasks.js";
import { moveTaskTool } from "./tools/move-task.js";
import { listActiveJobsTool } from "./tools/list-active-jobs.js";
import { listCompletedJobsTool } from "./tools/list-completed-jobs.js";
import { listJobsEnhancedTool } from "./tools/list-jobs-enhanced.js";
import { initializeProjectStructureTool } from "./tools/initialize-project-structure.js";
import { architectureAuditTool } from "./tools/architecture-audit.js";
import {
  editTaskTool,
  replaceLinesTool,
  rewriteDomainTool,
  appendTaskTool,
  removeTaskTool
} from "./tools/domain-crud.js";

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

// Initialize Registry
const registry = new ToolRegistry();

// Register Tools
registry.register(createJobTool);
registry.register(completeJobTool);
registry.register(deleteJobTool);
registry.register(createTaskTool);
registry.register(batchCreateTasksTool);
registry.register(moveTaskTool);
registry.register(listActiveJobsTool);
registry.register(listCompletedJobsTool);
registry.register(listJobsEnhancedTool);
registry.register(initializeProjectStructureTool);
registry.register(architectureAuditTool);
registry.register(editTaskTool);
registry.register(replaceLinesTool);
registry.register(rewriteDomainTool);
registry.register(appendTaskTool);
registry.register(removeTaskTool);

// Apply registry handlers to server
registry.applyTo(server);

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
