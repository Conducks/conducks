<!-- @format -->

# CONDUCKS Test Suite

Comprehensive integration tests for all CONDUCKS workflows.

## Overview

Tests cover the complete lifecycle:

1. **Initialization** - Project structure setup
2. **Job Creation** - Single and split job creation
3. **Task Management** - Create, move, complete tasks
4. **Job Completion** - Archive completed jobs
5. **Listing & Info** - Query jobs and system state
6. **Edge Cases** - Validation and error handling
7. **End-to-End** - Full workflow integration

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

## Test Structure

```
test/
└── workflows.test.ts    # Integration tests for all flows
```

## What Gets Tested

### ✓ Initialization Flow

- Project structure creation
- Directory hierarchy (jobs/, ProjectX/w1/, etc.)
- Subproject folder creation (to-do, done-to-do, analysis, problem-solution)

### ✓ Job Creation Flow

- Single job creation
- Multi-job splitting (when complexity detected)
- Job metadata validation
- File naming conventions

### ✓ Task Creation Flow

- Task creation within jobs
- Multiple tasks per job
- Task file generation (markdown)
- Job reference integrity

### ✓ Task Movement Flow

- Move task to done-to-do (completion)
- Move task to analysis folder
- Move task to problem-solution folder
- File path updates in job metadata

### ✓ Job Listing Flow

- List active jobs
- List completed jobs
- Enhanced job details (with tasks)
- Task counts and status

### ✓ Smart Info Flow

- System-level information
- Job-level information
- Metadata aggregation

### ✓ Job Completion Flow

- Prevent completion with active tasks
- Complete job after all tasks done
- Job file archival (to-do → done-to-do)

### ✓ Edge Cases

- Invalid job_id rejection
- Missing required fields
- Non-existent task files
- Validation errors

### ✓ End-to-End

- Complete job lifecycle from creation to completion
- Multi-task coordination
- State verification at each step

## Test Workspace

Tests use isolated workspace:

```
test-workspace/
└── conducks/storage/
    ├── jobs/
    │   ├── to-do/          # Active job .toon files
    │   └── done-to-do/     # Completed job .toon files
    └── ProjectX/
        └── w1/
            ├── to-do/              # Active tasks
            ├── done-to-do/         # Completed tasks
            ├── analysis/           # Analysis tasks
            └── problem-solution/   # Solution docs
```

**Note:** Workspace is cleaned after tests. Comment out cleanup in `after()` hook to inspect artifacts.

## Expected Output

```
CONDUCKS Workflow Integration Tests

✔ 1. Initialization Flow (2 tests)
  ✔ should initialize project structure

✔ 2. Job Creation Flow (2 tests)
  ✔ should create a single job
  ✔ should create multiple jobs when splitting is suggested

✔ 3. Task Creation Flow (2 tests)
  ✔ should create task for existing job
  ✔ should create multiple tasks for same job

✔ 4. Task Movement Flow (2 tests)
  ✔ should move task to done-to-do folder
  ✔ should move task to analysis folder

✔ 5. Job Listing Flow (2 tests)
  ✔ should list active jobs
  ✔ should get enhanced job details

✔ 6. Smart Info Flow (2 tests)
  ✔ should provide system-level info
  ✔ should provide job-level info

✔ 7. Job Completion Flow (3 tests)
  ✔ should not complete job with incomplete tasks
  ✔ should complete job after all tasks are done
  ✔ should list completed jobs

✔ 8. Edge Cases & Validation (2 tests)
  ✔ should reject task creation for non-existent job
  ✔ should handle missing required fields

✔ 9. Full Workflow End-to-End (1 test)
  ✔ should execute complete job lifecycle

Total: 18 tests passed
```

## Debugging Failed Tests

1. **Check test workspace**: Comment out cleanup in `after()` hook
2. **Inspect job files**: Look at `.toon` files in `test-workspace/conducks/storage/jobs/`
3. **Check task files**: Review markdown in `test-workspace/conducks/storage/ProjectX/w1/`
4. **Enable verbose logs**: Use `npm run test:verbose`

## Adding New Tests

```typescript
describe('New Feature Flow', () => {
	it('should test new feature', async () => {
		console.log('\\n--- Test: Feature name ---');

		const result = await handleNewFeature({
			/* args */
		});

		assert.ok(result.success, 'Feature should work');
		console.log('✓ Feature validated');
	});
});
```

## CI/CD Integration

Add to GitHub Actions:

```yaml
- name: Run tests
  run: npm test
```

Tests use Node.js native test runner (no external dependencies like Jest/Mocha).

## Performance

- Full suite: ~2-3 seconds
- Isolated workspace (no interference)
- Parallel test execution support (future)

## Coverage

Current: ~85% of core workflows
Missing: Architecture audit, domain CRUD (add as features stabilize)
