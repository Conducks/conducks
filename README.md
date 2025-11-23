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

- **TOON Files**: Efficient JSON-based storage in jobs/to-do/ and jobs/done-to-do/
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
- `conducks/storage/` - Storage directory
- `jobs/to-do/` - Active jobs
- `jobs/done-to-do/` - Completed jobs
- `README.md` - Project overview

### 2. Create Your First Job

Define a high-level objective:

```bash
conducks.create_job({
  name: "Implement User Authentication",
  description: "Add secure JWT-based user login and registration",
  priority: "high"
})
```

This creates Job #1 with metadata file `jobs/to-do/001_implement-user-authentication.toon`.

### 3. Break Down into Tasks

Add specific work items to your job:

```bash
conducks.create_task({
  job_id: 1,
  title: "Setup authentication service",
  description: "Create Express middleware for JWT validation",
  team: "backend",
  complexity: "medium"
})

conducks.create_task({
  job_id: 1,
  title: "Design user database schema",
  description: "Users table with credentials and roles",
  team: "backend",
  complexity: "simple"
})
```

### 4. Monitor Progress

Get insights into your work:

```bash
# Overview of all active jobs
conducks.list_active_jobs()

# Detailed view of specific job
conducks.list_jobs_enhanced({ job_id: 1 })

# System-wide context and analytics
conducks.smart_info({ context: "system" })
```

### 5. Track Completion

Move completed tasks and finish jobs:

```bash
# Mark task complete (moves to done-to-do folder)
conducks.move_task({
  project: "my-project",
  subproject: "w1",
  task_file: "task_002_design-user-database-schema.md",
  target_folder: "done-to-do"
})

# Complete entire job
conducks.complete_job({ job_id: 1 })
```

## 📖 How It Works

### The CONDUCKS Workflow

1. **Initialize**: Set up CONDUCKS in any development workspace
2. **Create Jobs**: Define high-level project objectives with human-readable names
3. **Break Down**: Add specific tasks with team assignments and complexity ratings
4. **Track Progress**: Move tasks through folders (to-do → analysis → done-to-do)
5. **Complete Jobs**: Archive finished work with completion notes

### Key Concepts

- **Jobs**: High-level objectives stored as `.toon` metadata files
- **Tasks**: Specific work items stored as markdown files in project folders
- **Subprojects**: Organized by `w1/`, `w2/`, `w3/` for parallel work streams
- **Status Tracking**: Four folders track task lifecycle (to-do, analysis, problem-solution, done-to-do)

### Example Project Structure

```
my-project/
├── conducks/
│   └── storage/          # System metadata
├── jobs/
│   ├── to-do/           # Active jobs (#1, #2, #3...)
│   └── done-to-do/      # Completed jobs
├── ProjectX/
│   ├── w1/              # Subproject 1
│   │   ├── to-do/       # Active tasks
│   │   ├── analysis/    # Tasks under analysis
│   │   ├── problem-solution/ # Problem/solution docs
│   │   └── done-to-do/  # Completed tasks
│   └── w2/              # Subproject 2
└── README.md           # Auto-generated project overview
```

### Available Tools

CONDUCKS provides 19 MCP tools across 4 categories:

#### Job Management (6 tools)
- `list_active_jobs` - Overview of current work
- `list_completed_jobs` - Archive of finished work
- `list_jobs_enhanced` - Detailed job inspection
- `create_job` - Define new objectives
- `complete_job` - Archive completed work
- `smart_info` - Context-aware information

#### Task Management (2 tools)
- `create_task` - Add work items to jobs
- `move_task` - Change task organization

#### Domain CRUD (5 tools)
- `edit_task` - Update task properties
- `replace_lines` - Precise content editing
- `rewrite_domain` - Complete file rewrites
- `append_task` - Add new tasks
- `remove_task` - Delete tasks

#### Project Structure (2 tools)
- `initialize_project_structure` - Workspace setup
- `architecture_audit` - Repository structure analysis

For complete documentation see [DOCS/TOOL_REFERENCE.md](../DOCS/TOOL_REFERENCE.md).

## 🚀 Starting CONDUCKS

CONDUCKS can be started 3 ways depending on your needs:

### Method 1: Quick Start (Production)
```bash
cd conducks
npm install && npm run build
node build/index.js
```
**Best for:** Production use, minimal setup

### Method 2: Development Mode (Auto-rebuild)
```bash
cd conducks
npm install
npm run watch
```
**Best for:** Development, automatically rebuilds on changes  
**Opens on:** http://localhost:3000

### Method 3: MCP Inspector (Testing)
```bash
cd conducks
npm install && npm run build
npm run inspector
```
**Best for:** Testing tools interactively  
**Opens on:** http://localhost:6274 with MCP Inspector interface

## Installation

To use with Claude Desktop, add the server config:

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

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. We recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector), which is available as a package script:

```bash
npm run inspector
```

The Inspector will provide a URL to access debugging tools in your browser.
