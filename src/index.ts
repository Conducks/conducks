#!/usr/bin/env node

/**
 * CONDUCKS MCP Server - Intelligent Documentation Organizer
 * Hierarchical Jobs->Tasks system with numbered IDs for easy human reference
 * 
 * Modular Architecture:
 * - tools/: Individual tool handlers (process-docs, get-job-tasks, etc.)
 * - tools/analytics/: Job and system analytics modules
 * - shared/: Common utilities (analytics-utils)
 * - core/: Storage, types, and business logic
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { CONDUCKSStorage } from './core/types.js';
import { DOCS_ROOT } from './core/config.js';
import { loadCONDUCKS, saveCONDUCKS } from './core/storage.js';
import {
  handleInitializeProjectStructure,
  formatInitResult,
  handleCreateJob,
  formatCreateJobResult,
  handleCompleteJob,
  formatCompleteJobResult,
  handleSmartInfo,
  formatSmartInfoResult,
  handleMoveTask,
  formatMoveTaskResult,
  handleListJobsEnhanced,
  handleEditTask,
  formatEditTaskResult,
  handleReplaceLines,
  formatReplaceLinesResult,
  handleRewriteDomain,
  formatRewriteDomainResult,
  handleAppendTask,
  formatAppendTaskResult,
  handleRemoveTask,
  formatRemoveTaskResult
} from './tools/index.js';

const log = (message: string) => console.error(`[${new Date().toISOString()}] CONDUCKS: ${message}`);

// MCP Tools implementation

class CONDUCKSServer {
  private server: Server;
  private storage: CONDUCKSStorage | null = null;

  constructor() {
    this.server = new Server(
      {
        name: "conducks",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupHandlers();
  }

  private async loadStorage(): Promise<CONDUCKSStorage> {
    if (!this.storage) {
      this.storage = await loadCONDUCKS();
    }
    return this.storage;
  }

  private async saveStorage(): Promise<void> {
    if (this.storage) {
      await saveCONDUCKS(this.storage);
      // Reload to ensure consistency
      this.storage = await loadCONDUCKS();
    }
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler?.(ListToolsRequestSchema, async () => {
      log('ListTools requested');
      return {
        tools: [
          {
            name: "list_jobs_enhanced",
            description: "Job listing with ACTIVE and COMPLETED sections separated. Overview mode (no args) shows all jobs with task counts. Detailed mode (job_id) shows full job info with tasks.",
            inputSchema: {
              type: "object",
              properties: {
                job_id: {
                  type: "number",
                  description: "Optional job number for detailed view. Omit for overview of all jobs."
                }
              }
            }
          },
          {
            name: "initialize_project_structure",
            description: "Scan workspace and create mirrored project/subproject structure in server storage with organization rules",
            inputSchema: {
              type: "object",
              properties: {
                workspace_path: {
                  type: "string",
                  description: "Absolute path to workspace root directory"
                },
                project_name: {
                  type: "string",
                  description: "Optional override for detected project name"
                }
              },
              required: ["workspace_path"]
            }
          },
          {
            name: "create_job",
            description: "Create new job file with smart splitting logic (can create multiple jobs if independent work streams detected)",
            inputSchema: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "Job name (concise, descriptive)"
                },
                description: {
                  type: "string",
                  description: "Detailed job description"
                },
                priority: {
                  type: "string",
                  enum: ["low", "medium", "high"],
                  description: "Job priority level"
                },
                estimated_effort: {
                  type: "string",
                  description: "Time estimate (e.g., '2 weeks', '1 month')"
                },
                objectives: {
                  type: "array",
                  items: { type: "string" },
                  description: "List of job objectives (agent may split into multiple jobs if many independent objectives)"
                },
                dependencies: {
                  type: "array",
                  items: { type: "string" },
                  description: "Dependencies on other jobs or external factors"
                },
                should_split: {
                  type: "boolean",
                  description: "Suggest splitting into multiple parallel jobs"
                }
              },
              required: ["name", "description"]
            }
          },
          {
            name: "complete_job",
            description: "Mark job as completed and move from to-do to done-to-do folder",
            inputSchema: {
              type: "object",
              properties: {
                job_id: {
                  type: "number",
                  description: "Job ID to complete"
                },
                completion_notes: {
                  type: "string",
                  description: "Optional notes about job completion"
                }
              },
              required: ["job_id"]
            }
          },
          {
            name: "smart_info",
            description: "Context-aware unified info tool (replaces conducks_info, get_job_analytics, list_jobs) - automatically provides relevant information based on what you're working on",
            inputSchema: {
              type: "object",
              properties: {
                context: {
                  type: "string",
                  enum: ["system", "job", "project"],
                  description: "Context type to get info about (auto-detected if omitted)"
                },
                job_id: {
                  type: "number",
                  description: "Specific job ID for job context"
                },
                project_name: {
                  type: "string",
                  description: "Project name for project context"
                },
                subproject_name: {
                  type: "string",
                  description: "Subproject name for detailed project context"
                }
              }
            }
          },
          {
            name: "move_task",
            description: "Move domain file between to-do and done-to-do folders (with inline rules guidance)",
            inputSchema: {
              type: "object",
              properties: {
                project: {
                  type: "string",
                  description: "Project name"
                },
                subproject: {
                  type: "string",
                  description: "Subproject/service name"
                },
                domain_file: {
                  type: "string",
                  description: "Domain filename (e.g., 'poi-discovery.md')"
                },
                direction: {
                  type: "string",
                  enum: ["to_done", "to_todo"],
                  description: "Move to done-to-do (archive) or to to-do (reactivate)"
                }
              },
              required: ["project", "subproject", "domain_file", "direction"]
            }
          },
          {
            name: "edit_task",
            description: "Edit specific task fields (status, team, complexity, description) within domain file",
            inputSchema: {
              type: "object",
              properties: {
                project: { type: "string", description: "Project name" },
                subproject: { type: "string", description: "Subproject name" },
                domain_file: { type: "string", description: "Domain filename" },
                task_id: { type: "number", description: "Task number to edit" },
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
              required: ["project", "subproject", "domain_file", "task_id", "updates"]
            }
          },
          {
            name: "replace_lines",
            description: "Replace specific line range in domain file with new content. Use for precise edits to task blocks or any file section.",
            inputSchema: {
              type: "object",
              properties: {
                project: { type: "string", description: "Project name" },
                subproject: { type: "string", description: "Subproject name" },
                domain_file: { type: "string", description: "Domain filename" },
                start_line: { type: "number", description: "Start line number (1-indexed)" },
                end_line: { type: "number", description: "End line number (inclusive)" },
                replacement_text: { type: "string", description: "New content to replace lines with" }
              },
              required: ["project", "subproject", "domain_file", "start_line", "end_line", "replacement_text"]
            }
          },
          {
            name: "rewrite_domain",
            description: "Completely rewrite domain file with new content (shows health metrics after)",
            inputSchema: {
              type: "object",
              properties: {
                project: { type: "string", description: "Project name" },
                subproject: { type: "string", description: "Subproject name" },
                domain_file: { type: "string", description: "Domain filename" },
                new_content: { type: "string", description: "Complete new file content" }
              },
              required: ["project", "subproject", "domain_file", "new_content"]
            }
          },
          {
            name: "append_task",
            description: "Add new task to end of TASKS section in domain file",
            inputSchema: {
              type: "object",
              properties: {
                project: { type: "string", description: "Project name" },
                subproject: { type: "string", description: "Subproject name" },
                domain_file: { type: "string", description: "Domain filename" },
                task_content: { type: "string", description: "Full task block to append" }
              },
              required: ["project", "subproject", "domain_file", "task_content"]
            }
          },
          {
            name: "remove_task",
            description: "Remove specific task from domain file",
            inputSchema: {
              type: "object",
              properties: {
                project: { type: "string", description: "Project name" },
                subproject: { type: "string", description: "Subproject name" },
                domain_file: { type: "string", description: "Domain filename" },
                task_id: { type: "number", description: "Task number to remove" }
              },
              required: ["project", "subproject", "domain_file", "task_id"]
            }
          }
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Log raw incoming tool requests with sanitized payload
      const sanitize = (obj: any): any => {
        if (obj == null) return obj;
        if (typeof obj === 'string') {
          return obj.length > 800 ? obj.slice(0, 800) + '…[truncated]' : obj;
        }
        if (Array.isArray(obj)) return obj.map(sanitize);
        if (typeof obj === 'object') {
          const out: any = {};
          for (const k of Object.keys(obj)) {
            out[k] = sanitize((obj as any)[k]);
          }
          return out;
        }
        return obj;
      };

      const reqId = Math.random().toString(36).slice(2, 8);
      const start = Date.now();
      log(`REQ ${reqId} ▶ tool=${name} args=${JSON.stringify(sanitize(args))}`);

      try {
        let reply: any;
        switch (name) {
          case "list_jobs_enhanced":
            reply = await this.handleListJobsEnhanced(args);
            break;
          case "initialize_project_structure":
            reply = await this.handleInitializeProjectStructure(args);
            break;
          case "create_job":
            reply = await this.handleCreateJob(args);
            break;
          case "complete_job":
            reply = await this.handleCompleteJob(args);
            break;
          case "smart_info":
            reply = await this.handleSmartInfo(args);
            break;
          case "move_task":
            reply = await this.handleMoveTask(args);
            break;
          case "edit_task":
            reply = await this.handleEditTask(args);
            break;
          case "replace_lines":
            reply = await this.handleReplaceLines(args);
            break;
          case "rewrite_domain":
            reply = await this.handleRewriteDomain(args);
            break;
          case "append_task":
            reply = await this.handleAppendTask(args);
            break;
          case "remove_task":
            reply = await this.handleRemoveTask(args);
            break;
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
        const ms = Date.now() - start;
        // Try to summarize reply size without dumping full payload
        const summary = (() => {
          try {
            const text = reply?.content?.[0]?.text;
            if (typeof text === 'string') {
              return `contentLen=${text.length}`;
            }
            return `keys=${Object.keys(reply || {}).join(',').slice(0, 80)}`;
          } catch {
            return 'replySummary=unavailable';
          }
        })();
        log(`REQ ${reqId} ✓ tool=${name} ok in ${ms}ms ${summary}`);
        return reply;
      } catch (error: any) {
        const ms = Date.now() - start;
        log(`REQ ${reqId} ✗ tool=${name} failed in ${ms}ms error=${error?.message || error}`);
        throw error;
      }
    });

    // List resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      log('ListResources requested');
      return {
        resources: [] // No static resources for now
      };
    });

    // Read resources
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      log(`ReadResource requested: ${request.params.uri}`);
      throw new McpError(ErrorCode.MethodNotFound, `Resource not found: ${request.params.uri}`);
    });
  }

  // Delegate to tool modules - clean separation of concerns
  private async handleInitializeProjectStructure(args: any) {
    log(`Initializing project structure from workspace: ${args.workspace_path}`);
    const result = await handleInitializeProjectStructure(args);
    return {
      content: [{ type: "text", text: formatInitResult(result) }]
    };
  }

  private async handleCreateJob(args: any) {
    log(`Creating job: ${args.name}`);
    const result = await handleCreateJob(args);
    return {
      content: [{ type: "text", text: formatCreateJobResult(result) }]
    };
  }

  private async handleCompleteJob(args: any) {
    log(`Completing job #${args.job_id}`);
    const result = await handleCompleteJob(args);
    return {
      content: [{ type: "text", text: formatCompleteJobResult(result) }]
    };
  }

  private async handleSmartInfo(args: any) {
    log(`Getting smart info - context: ${args.context || 'auto-detect'}`);
    const result = await handleSmartInfo(args);
    return {
      content: [{ type: "text", text: formatSmartInfoResult(result) }]
    };
  }

  private async handleMoveTask(args: any) {
    log(`Moving task: ${args.domain_file} ${args.direction}`);
    const result = await handleMoveTask(args);
    return {
      content: [{ type: "text", text: formatMoveTaskResult(result) }]
    };
  }

  private async handleEditTask(args: any) {
    log(`Editing task ${args.task_id} in ${args.domain_file}`);
    const result = await handleEditTask(args);
    return {
      content: [{ type: "text", text: formatEditTaskResult(result) }]
    };
  }

  private async handleReplaceLines(args: any) {
    log(`Replacing lines ${args.start_line}-${args.end_line} in ${args.domain_file}`);
    const result = await handleReplaceLines(args);
    return {
      content: [{ type: "text", text: formatReplaceLinesResult(result) }]
    };
  }

  private async handleRewriteDomain(args: any) {
    log(`Rewriting domain file: ${args.domain_file}`);
    const result = await handleRewriteDomain(args);
    return {
      content: [{ type: "text", text: formatRewriteDomainResult(result) }]
    };
  }

  private async handleAppendTask(args: any) {
    log(`Appending task to ${args.domain_file}`);
    const result = await handleAppendTask(args);
    return {
      content: [{ type: "text", text: formatAppendTaskResult(result) }]
    };
  }

  private async handleRemoveTask(args: any) {
    log(`Removing task ${args.task_id} from ${args.domain_file}`);
    const result = await handleRemoveTask(args);
    return {
      content: [{ type: "text", text: formatRemoveTaskResult(result) }]
    };
  }

  private async handleListJobsEnhanced(args: any) {
    log(`List jobs enhanced: ${args.job_id ? `job #${args.job_id} detail` : 'overview'}`);
    const result = await handleListJobsEnhanced(args);
    return {
      content: [{ type: "text", text: result }]
    };
  }

  async run() {
    log("Starting CONDUCKS MCP Server...");

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    log(`Storage path: ${DOCS_ROOT}`);
    log("CONDUCKS server running on stdio - Ready for documentation organization!");
  }
}

// Main execution
async function main() {
  const server = new CONDUCKSServer();
  await server.run();
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  log('Shutting down CONDUCKS server...');
  process.exit(0);
});

main().catch((error) => {
  log(`Server error: ${error.message}`);
  process.exit(1);
});
