<!-- @format -->

# CONDUCKS MCP Server

**Intelligent Job & Task Management System**

_Hierarchical Jobs→Tasks system with numbered IDs for easy human reference_

CONDUCKS transforms development workspaces into structured, hierarchical project management systems. Create Jobs (high-level objectives), break them into Tasks (specific work items), and track progress across teams and domains. Built for AI agents and human developers working together.

## 🌟 Features

### 📋 **Job & Task Management**

- **Hierarchical Organization**: Jobs contain multiple Tasks with automatic numbering
- **Progress Tracking**: Real-time status updates and completion monitoring
- **Context Awareness**: Smart information retrieval based on your current work context
- **Flexible Task Management**: Create, update, move, and organize tasks across folders
- **Multi-Project Support**: Handle complex workspaces with subprojects and domains

### 🎯 **Powerful CRUD Operations**

- **Domain File Editing**: Update task status, teams, complexity, and descriptions
- **Precise Content Control**: Replace line ranges, append content, remove tasks
- **File Organization**: Move tasks between to-do, analysis, problem-solution folders
- **Automatic Directory Creation**: Set up project structures with intelligent defaults

### 🔍 **Advanced Analytics**

- **System Insights**: Job counts, team productivity, completion rates
- **Progress Visualization**: Progress bars and completion tracking
- **Risk Analysis**: Complexity assessment and timeline forecasting
- **Cross-Service Coordination**: Dependency tracking and relationship mapping

### 💾 **Robust Storage System**

- **TOON Files**: Efficient TOON-based storage in jobs/to-do/ and jobs/done-to-do/
- **Human-Readable IDs**: Jobs numbered as #1, #2, #3 for easy reference
- **Cross-References**: Automatic tracking of service relationships and dependencies
- **Backup & Recovery**: Built-in versioning and data integrity checks

## 🚀 Quick Start

### 1. Setup CONDUCKS for Your Project

Initialize CONDUCKS in your development workspace:

```bash
# Navigate to any project directory
cd my-project

# Initialize CONDUCKS structure
conducks.initialize_project_structure({ workspace_path: "." })
```

This creates:

- `storage/` - Storage directory for jobs and metadata
- `jobs/to-do/` - Active jobs
- `jobs/done-to-do/` - Completed jobs

### 2. Create Your First Job

Define a high-level objective:

```bash
conducks.create_job({
  workspace_path: "my-project",
  name: "Implement User Authentication",
  description: "Add secure JWT-based user login and registration",
  priority: "high",
  domain: "authentication"
})
```

This creates Job 1 with metadata file `jobs/to-do/001_implement-user-authentication.toon`.

### 3. Break Down into Tasks

Add specific work items to your job:

```bash
# Single task creation
conducks.create_task({
  workspace_path: "my-project",
  job_id: 1,
  title: "Setup authentication service",
  description: "Create Express middleware for JWT validation",
  priority: "high",
  complexity: "medium",
  team: "backend"
})

# Batch task creation
conducks.batch_create_tasks({
  workspace_path: "my-project",
  job_id: 1,
  tasks: [
    {
      title: "Design database schema",
      description: "Users table with credentials and roles",
      priority: "medium",
      complexity: "simple",
      team: "backend"
    },
    {
      title: "Create login frontend",
      description: "React components for user login",
      priority: "high",
      complexity: "medium",
      team: "frontend"
    }
  ]
})
```

### 4. Monitor Progress

Get insights into your work:

```bash
# Overview of all active jobs
conducks.list_active_jobs({ workspace_path: "my-project" })

# Detailed view of specific job with tasks
conducks.list_jobs_enhanced({ workspace_path: "my-project", job_id: 1 })

# View completed jobs
conducks.list_completed_jobs({ workspace_path: "my-project" })
```

### 5. Track Completion

Move completed tasks and finish jobs:

```bash
# Mark task complete (moves between folders)
conducks.move_task({
  workspace_path: "my-project",
  subproject: "w1",
  task_file: "task_001_setup-authentication-service.md",
  target_folder: "done-to-do",
  source_folder: "to-do"
})

# Complete entire job (moves job to done-to-do)
conducks.complete_job({
  workspace_path: "my-project",
  job_id: 1,
  completion_notes: "All authentication features implemented and tested"
})
```

## 📖 How It Works

### The CONDUCKS Workflow

1. **Initialize**: Set up CONDUCKS in any development workspace
2. **Create Jobs**: Define high-level project objectives with human-readable names
3. **Break Down**: Add specific tasks (single or batch) with team assignments and complexity ratings
4. **Track Progress**: Move tasks through folders (to-do → analysis → problem-solution → done-to-do)
5. **Complete Jobs**: Archive finished work with completion notes

### Key Concepts

- **Jobs**: High-level objectives stored as `.toon` metadata files in `storage/jobs/`
- **Tasks**: Specific work items stored as markdown files in workspace folders
- **Subprojects**: Organized by `ProjectX/w1/`, `ProjectX/w2/`, etc. for parallel work streams
- **Status Tracking**: Four folders track task lifecycle (to-do, analysis, problem-solution, done-to-do)

### Example Project Structure

```
my-project/
├── storage/
│   ├── jobs/
│   │   ├── to-do/           # Active jobs (#1, #2, #3...)
│   │   └── done-to-do/      # Completed jobs
│   └── ProjectX/
│       ├── w1/              # Subproject 1
│       │   ├── to-do/       # Active tasks
│       │   ├── analysis/    # Tasks under analysis
│       │   ├── problem-solution/ # Problem/solution docs
│       │   └── done-to-do/  # Completed tasks
│       └── w2/              # Subproject 2
└── README.md               # Auto-generated project overview
```

### Available Tools

CONDUCKS provides 16 MCP tools across 4 categories:

#### Job Management (6 tools)

- `initialize_project_structure` - Set up workspace
- `create_job` - Define new objectives
- `list_active_jobs` - Overview of current work
- `list_completed_jobs` - Archive of finished work
- `list_jobs_enhanced` - Detailed job inspection
- `complete_job` - Archive completed work

#### Task Management (3 tools)

- `create_task` - Add single task to job
- `batch_create_tasks` - Add multiple tasks to job
- `move_task` - Move tasks between folders

#### Domain CRUD (5 tools)

- `edit_task` - Update task properties in domain files
- `replace_lines` - Precise content editing in files
- `rewrite_domain` - Complete file rewrites
- `append_task` - Add new tasks to domain files
- `remove_task` - Delete tasks from domain files

#### Analytics & Architecture (2 tools)

- `architecture_audit` - Repository structure analysis
- `analytics` - Job and system analytics (via analytics module)

## 🔧 Configuration

### Environment Variables

CONDUCKS supports the following environment variables for customization:

- **`CONDUCKS_WORKSPACE_ROOT`**: Base directory for resolving workspace paths (default: current directory)

  - Use this when your MCP server runs from a different directory than your workspaces
  - Example: `export CONDUCKS_WORKSPACE_ROOT=/Users/you/projects`

- **`CONDUCKS_STORAGE_ROOT`**: Custom storage location (default: `./storage`)
  - Override the default storage directory location
  - Example: `export CONDUCKS_STORAGE_ROOT=/var/conducks/storage`

### Setting Environment Variables

**For MCP Server (Claude Desktop):**

```json
{
	"mcpServers": {
		"conducks": {
			"command": "node",
			"args": ["/path/to/conducks/build/index.js"],
			"env": {
				"CONDUCKS_WORKSPACE_ROOT": "/Users/you/projects",
				"CONDUCKS_STORAGE_ROOT": "/Users/you/.conducks/storage"
			}
		}
	}
}
```

## Installation & Setup

### Prerequisites

- Node.js 18+
- npm

### For Claude Desktop

On MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
	"mcpServers": {
		"conducks": {
			"command": "/path/to/conducks/build/index.js"
		}
	}
}
```

### Development Setup

```bash
git clone https://github.com/your-repo/conducks
cd conducks
npm install
npm run build
npm test  # Run comprehensive test suite
```

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. We recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npm run inspector
```

The Inspector will provide a URL to access debugging tools in your browser.

## 🏗️ Architecture

### Core Architecture

CONDUCKS follows a modular architecture optimized for AI agent interactions:

```
conducks/
├── src/
│   ├── index.ts          # MCP Server & Tool Registry
│   ├── core/
│   │   ├── storage.ts    # TOON file read/write operations
│   │   ├── logic.ts      # Job/task generation logic
│   │   ├── types.ts      # Type definitions
│   │   └── config.ts     # System configuration
│   ├── tools/            # MCP Tool Implementations (16 tools)
│   │   ├── create-job.ts
│   │   ├── create-task.ts
│   │   ├── batch-create-tasks.ts
│   │   ├── move-task.ts
│   │   ├── complete-job.ts
│   │   ├── list-active-jobs.ts
│   │   ├── list-completed-jobs.ts
│   │   ├── list-jobs-enhanced.ts
│   │   ├── domain-crud.ts      # CRUD operations
│   │   ├── initialize-project-structure.ts
│   │   ├── architecture-audit.ts
│   │   ├── analytics/
│   │   │   ├── job-analytics.ts
│   │   │   └── system-analytics.ts
│   │   └── index.ts
│   ├── features/         # Advanced Features
│   │   ├── architect/    # Human-AI collaboration
│   │   └── docs-watcher/ # File monitoring
│   ├── shared/           # Shared utilities
│   │   └── analytics-utils.ts
│   └── dashboard/        # Web dashboard
├── storage/              # Default storage location
└── test/                 # Comprehensive test suite
```

### Key Design Principles

- **Token Efficiency**: Plain text responses instead of markdown (80% token reduction)
- **Modular Tools**: Each tool is a separate module for easy maintenance
- **Workspace Isolation**: Each workspace maintains its own storage
- **TOON Storage**: Efficient serialization format for metadata
- **Human-Readable IDs**: Numeric job/task IDs for easy reference

### Storage Format

Jobs are stored as TOON files in the workspace storage directory:

```json
{
	"id": 1,
	"title": "Implement User Authentication",
	"description": "Add secure JWT-based user login",
	"domain": "authentication",
	"priority": "high",
	"created": "2025-01-15T10:30:00Z",
	"tasks": [
		{
			"id": "001",
			"title": "Setup auth service",
			"status": "active",
			"priority": "high",
			"team": "backend"
		}
	]
}
```

Tasks are stored as markdown files with full context and metadata.
