<!-- @format -->

# CONDUCKS Test Suite

Comprehensive integration tests for all CONDUCKS workflows and tools.

## Overview

Tests cover the complete lifecycle of the CONDUCKS system:

1. **Initialization** - Project structure setup and validation
2. **Job Creation** - Single and batch job creation
3. **Task Management** - Create, batch create, move, and organize tasks
4. **Job Completion** - Archive completed jobs (with task validation)
5. **Information Retrieval** - List jobs, enhanced details, completion status
6. **Domain CRUD Operations** - Edit, replace, rewrite, append, remove tasks/files
7. **Edge Cases** - Validation, error handling, and boundary conditions
8. **Analytics & Audit** - Architecture audit and analytics functionality

## Running Tests

### Quick Test

```bash
npm test
```

### Verbose Output

```bash
npm run test:verbose
```

### Manual Build + Test

```bash
npm run build
node --test build/test/**/*.test.js
```

## Current Test Structure

```
test/
├── tool-validation.test.ts    # Comprehensive 16-tool validation
├── workflows.test.ts          # Integration workflows
├── dynamic_paths.test.ts      # Dynamic project path testing
├── job-management-test.ts     # Job lifecycle testing
├── setup.ts                   # Test infrastructure
└── README.md                  # This documentation
```

## What Gets Tested

### ✓ Tool Validation Tests (16 MCP Tools)

**Job Management (6 tools):**

- `initialize_project_structure` - Workspace setup with git detection
- `create_job` - Single job creation with metadata validation
- `list_active_jobs` - Active job overview and counts
- `list_completed_jobs` - Completed job listing (including jobs with no tasks)
- `list_jobs_enhanced` - Detailed job inspection with task breakdown
- `complete_job` - Job completion with task validation

**Task Management (3 tools):**

- `create_task` - Single task creation with folder targeting
- `batch_create_tasks` - Multiple task creation with folder organization
- `move_task` - Task movement between folders (to-do → analysis → problem-solution → done-to-do)

**Domain CRUD (5 tools):**

- `edit_task` - Update task properties in domain files
- `replace_lines` - Precise line replacement in files
- `rewrite_domain` - Complete file rewrites
- `append_task` - Add new tasks with both header formats
- `remove_task` - Remove tasks (supports `# Task` and `## Task` headers)

**Analytics & Architecture (2 tools):**

- `architecture_audit` - Repository structure analysis
- `analytics` - Job and system analytics

### ✓ Workflow Integration Tests

**Dynamic Project Paths:**

- Multi-workspace support
- Custom project structures
- Path resolution validation

### ✓ Edge Cases & Validation

- Invalid job/task IDs
- Missing required parameters
- File system permissions
- Concurrent operations
- Boundary conditions

## Test Workspace Management

Tests use isolated workspaces to prevent interference:

### Tool Validation Workspace

```
test-workspace-validation/storage/
├── jobs/
│   ├── to-do/           # Active job .toon files
│   └── done-to-do/      # Completed job .toon files
└── validation-workspace/
    └── ProjectX/
        └── main/
            ├── to-do/              # Task markdown files
            ├── analysis/
            ├── problem-solution/
            └── done-to-do/
```

### Dynamic Paths Workspace

```
test-workspace-dynamic/storage/
└── [Custom project structures]
```

**Note:** Workspaces are cleaned after each test suite. Comment out cleanup in test files to inspect artifacts.

## Expected Test Results

```
CONDUCKS Test Suite Results
===========================

✓ Tool Validation Tests (16 tools)
  Status: All 16 MCP tools validated successfully
  Coverage: 100% tool functionality
  Assertions: 60+ validation checks

✓ Workflow Integration Tests
  Dynamic Paths: Multi-workspace support ✓
  Job Lifecycle: Creation → Tasks → Completion ✓
  Storage: TOON format and file integrity ✓

✓ Overall Status: 22 tests / 22 passed / 0 failed
✓ Execution Time: ~6-8 seconds
✓ Coverage: Core workflows + edge cases
```

## Test Data Validation

Tests verify:

- **File System State**: All expected files/directories created
- **Data Integrity**: TOON format correctness and metadata consistency
- **API Contracts**: Function parameters and return values
- **Business Logic**: Task completion requirements, job status calculations
- **Error Handling**: Graceful failure with informative messages

## Debugging Failed Tests

### 1. Enable Debug Logging

```typescript
// Add to test files
console.log('Debug info:', variable);
```

### 2. Inspect Test Artifacts

```typescript
// Comment out cleanup in test after() blocks
// await fs.remove(TEST_ROOT);
```

### 3. Run Individual Tests

```bash
node --test build/test/tool-validation.test.js
```

### 4. Check File System State

```bash
find test-workspace-* -type f | head -20
```

### 5. Validate TOON Files

```bash
cat test-workspace-*/storage/jobs/to-do/*.toon
```

## Test Categories

### Unit Tests (Tool Validation)

- Each tool tested in isolation
- Mock-free design (uses real storage)
- Full API validation
- File system state verification

### Integration Tests (Workflows)

- End-to-end job lifecycles
- Multi-tool coordination
- Real project structures
- Cross-tool dependencies

### Validation Tests (Edge Cases)

- Error conditions
- Invalid inputs
- Boundary cases
- Security validations

## Performance Benchmarks

- **Full Suite**: 22 tests in ~6 seconds
- **Tool Validation**: 16 tools in ~2 seconds
- **Memory Usage**: Minimal (no test pollution)
- **Disk I/O**: Efficient TOON format
- **CI/CD Ready**: Fast and reliable

## Adding New Tests

### For Tool Validation

```typescript
describe('Tool X: tool_name', () => {
	it('should validate tool functionality', async () => {
		const result = await handleToolName(args);
		assert.ok(result.success, 'Tool should succeed');
		// Add filesystem validation
	});
});
```

### For Workflow Integration

```typescript
describe('Workflow X', () => {
	it('should complete end-to-end flow', async () => {
		// Setup
		// Execute workflow steps
		// Validate final state
	});
});
```

## CI/CD Integration

Add to GitHub Actions workflow:

```yaml
- name: Run CONDUCKS Test Suite
  run: |
    npm ci
    npm run build
    npm test
- name: Upload Test Results
  if: failure()
  uses: actions/upload-artifact@v3
  with:
    name: test-results
    path: build/test-results/
```

## Quality Assurance

- **Test Coverage**: All 16 MCP tools + workflows
- **Validation Depth**: File system + data integrity checks
- **Error Scenarios**: Comprehensive edge case coverage
- **Performance**: Fast execution with minimal resources
- **Maintainability**: Clear documentation and debugging support
