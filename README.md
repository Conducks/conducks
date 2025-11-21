<!-- @format -->

# CONDUCKS MCP Server

**Intelligent Documentation Organization System**

_Eliminate agent token waste and maintain documentation continuity through interactive AI organization._

This is a sophisticated MCP server that transforms raw development tasks into hierarchical, numbered project structures with automated progress tracking and cross-service coordination. CONDUCKS implements intelligent documentation management where agents ask clarifying questions, analyze context, and create living documentation structures.

## 🌟 Features

### 📋 **Job & Task Management**

- **process_docs**: Transform raw task descriptions into intelligent Job+Tasks hierarchies
- **get_job_tasks**: Retrieve tasks by human-readable numbered Job IDs
- **update_task_status**: Update task status with context and notes
- **list_jobs**: Overview of all organized jobs with progress tracking

### 🎯 **AI-Powered Intelligence**

- **Interactive Analysis**: Agents ask clarifying questions about task scope
- **Domain Detection**: Automatic categorization into meaningful domains (poi-discovery, ml-integration, etc.)
- **Cross-Service Linking**: Intelligent dependency detection and relationship mapping
- **Smart Organization**: Context-aware task prioritization and complexity assessment

### 💾 **Persistent Storage**

- **TOON Database**: Efficient encoded storage at `conducks/storage/jobs.toon` (configurable via `DOCS_ROOT`)
- **Human-Friendly IDs**: Jobs numbered as #1, #2, #3 for easy reference
- **Status Tracking**: Real-time progress monitoring with automatic timestamps
- **Backup Recovery**: Automatic versioning and rollback capabilities

## Development

Install dependencies:

```bash
npm install
```

Build the server:

```bash
npm run build
```

For development with auto-rebuild:

```bash
npm run watch
```

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
