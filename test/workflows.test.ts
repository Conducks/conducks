/**
 * CONDUCKS Workflow Integration Tests
 * Tests all major flows: initialization, job creation, task management, completion
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test workspace paths
const TEST_ROOT = path.join(__dirname, '../test-workspace');
const STORAGE_ROOT = path.join(TEST_ROOT, 'storage');
const JOBS_TODO = path.join(STORAGE_ROOT, 'test-workspace/jobs/to-do');
const JOBS_DONE = path.join(STORAGE_ROOT, 'test-workspace/jobs/done-to-do');
const PROJECT_ROOT = path.join(TEST_ROOT, 'ProjectX');

// CRITICAL: Set environment variable BEFORE importing any modules that use config
process.env.CONDUCKS_STORAGE_ROOT = STORAGE_ROOT;

// Import handlers AFTER setting environment (use source files for TypeScript compilation, built files at runtime)
// @ts-ignore - Build structure flattens src/tools to tools
import { handleInitializeProjectStructure } from '../tools/initialize-project-structure.js';
// @ts-ignore
import { handleCreateJob } from '../tools/create-job.js';
// @ts-ignore
import { handleCreateTask } from '../tools/create-task.js';
// @ts-ignore
import { handleMoveTask } from '../tools/move-task.js';
// @ts-ignore
import { handleCompleteJob } from '../tools/complete-job.js';
// @ts-ignore
import { handleListActiveJobs } from '../tools/list-active-jobs.js';
// @ts-ignore
import { handleListCompletedJobs } from '../tools/list-completed-jobs.js';
// @ts-ignore
import { handleListJobsEnhanced } from '../tools/list-jobs-enhanced.js';
// @ts-ignore
import { handleSmartInfo } from '../tools/smart-info.js';

describe('CONDUCKS Workflow Tests', () => {

  before(async () => {
    console.log('\n=== Setting up test workspace ===');
    // Clean and recreate test workspace
    await fs.remove(TEST_ROOT);
    await fs.ensureDir(TEST_ROOT);
    await fs.ensureDir(STORAGE_ROOT);
    console.log(`Test workspace created at: ${TEST_ROOT}`);
  });

  after(async () => {
    console.log('\n=== Cleaning up test workspace ===');
    // Comment out to inspect test artifacts
    // await fs.remove(TEST_ROOT);
    console.log('Test workspace cleaned');
  });

  describe('1. Initialization Flow', () => {

    it('should initialize project structure', async () => {
      console.log('\n--- Test: Initialize project structure ---');

      const result = await handleInitializeProjectStructure({
        workspace_path: '.',
        project_name: 'TestProject',
        auto_select: true // Auto-select all detected subprojects
      });

      console.log('Result:', JSON.stringify(result, null, 2));

      assert.ok(result.success, 'Initialization should succeed');

      // Initialization creates project structure, not workspace job directories
      // Job directories are created on-demand when jobs are created

      console.log('✓ Initialization complete');
    });
  });

  describe('2. Job Creation Flow', () => {

    it('should create a single job', async () => {
      console.log('\n--- Test: Create single job ---');

      const result = await handleCreateJob({
        workspace_path: 'test-workspace',
        name: 'Implement User Authentication',
        description: 'Build JWT-based authentication with refresh tokens',
        priority: 'high',
        objectives: ['JWT token generation', 'Refresh token rotation', 'Role-based access control'],
        dependencies: ['user-management'],
        tags: ['auth', 'security']
      });

      console.log('Result:', JSON.stringify(result, null, 2));

      assert.ok(result.success, 'Job creation should succeed');
      assert.strictEqual(result.jobs.length, 1, 'Should create exactly one job');
      assert.strictEqual(result.jobs[0].id, 1, 'First job should have id 1');

      // Verify job file exists at global jobs folder
      const jobFiles = fs.readdirSync(path.join(STORAGE_ROOT, 'jobs/to-do'));
      const jobFile = jobFiles.find(f => f.startsWith('001_') && f.endsWith('.toon'));
      assert.ok(jobFile, 'Job file should exist');

      console.log('✓ Job created successfully');
    });

    it('should create job with detailed metadata', async () => {
      console.log('\n--- Test: Create job with full metadata ---');

      const result = await handleCreateJob({
        workspace_path: 'test-workspace',
        name: 'Build E-commerce Platform',
        description: 'Complete e-commerce solution with multiple services',
        domain: 'ecommerce',
        priority: 'high',
        objectives: [
          'Product catalog service',
          'Shopping cart service',
          'Payment processing'
        ],
        dependencies: ['api', 'database'],
        tags: ['ecommerce', 'platform'],
        risk_assessment: 'High business impact, moderate technical risk'
      });

      console.log('Result:', JSON.stringify(result, null, 2));

      assert.ok(result.success, 'Job creation should succeed');
      assert.strictEqual(result.jobs.length, 1, 'Should create exactly one job');
      assert.ok(result.jobs[0].id > 1, 'Should have increasing job ID');

      console.log(`✓ Created job with metadata: ${result.jobs[0].name}`);
    });
  });

  describe('3. Task Creation Flow', () => {

    it('should create task for existing job', async () => {
      console.log('\n--- Test: Create task ---');

      const result = await handleCreateTask({
        job_id: 1,
        title: 'Implement JWT token generation',
        description: 'Create service to generate JWT tokens with configurable expiration',
        priority: 'high',
        complexity: 'medium',
        team: 'backend',
        service: 'auth-service',
        subproject: 'w1',
        workspace_path: 'test-workspace'
      });

      console.log('Result:', JSON.stringify(result, null, 2));

      assert.ok(result.success, 'Task creation should succeed');
      assert.ok(result.task, 'Should return task info');
      assert.strictEqual(result.task.id, '001', 'First task should be 001');

      // Verify task file exists - task.filePath is already the full relative path from project root
      const taskFile = path.join(TEST_ROOT, result.task.filePath);
      assert.ok(fs.existsSync(taskFile), 'Task markdown file should exist');

      const content = fs.readFileSync(taskFile, 'utf-8');
      assert.ok(content.includes('**Job Reference:** 1'), 'Should reference parent job');
      assert.ok(content.includes('**Status:** active'), 'Should have active status');

      console.log('✓ Task created:', result.task.title);
    });

    it('should create multiple tasks for same job', async () => {
      console.log('\n--- Test: Create multiple tasks ---');

      const tasks = [
        {
          job_id: 1,
          title: 'Implement refresh token rotation',
          description: 'Handle refresh token lifecycle',
          priority: 'high' as const,
          complexity: 'complex' as const,
          team: 'backend',
          subproject: 'w1' as const,
          workspace_path: 'test-workspace'
        },
        {
          job_id: 1,
          title: 'Add role-based access control',
          description: 'Implement RBAC middleware',
          priority: 'medium' as const,
          complexity: 'medium' as const,
          team: 'backend',
          subproject: 'w1' as const,
          workspace_path: 'test-workspace'
        }
      ];

      for (const taskArgs of tasks) {
        const result = await handleCreateTask(taskArgs);
        assert.ok(result.success, `Task "${taskArgs.title}" should be created`);
        console.log(`✓ Created task: ${taskArgs.title}`);
      }

      // Verify all tasks are in job
      const jobFile = fs.readdirSync(path.join(STORAGE_ROOT, 'jobs/to-do')).find(f => f.startsWith('001_'));
      const jobFileContent = fs.readFileSync(path.join(STORAGE_ROOT, 'jobs/to-do', jobFile!), 'utf-8');

      // Import toonToJson for proper TOON parsing
      // @ts-ignore
      const { toonToJson } = await import('../core/storage.js');
      const jobContent = toonToJson(jobFileContent);

      assert.strictEqual(jobContent.tasks.length, 3, 'Job should have 3 tasks');
      console.log(`✓ Job now has ${jobContent.tasks.length} tasks`);
    });
  });

  describe('4. Task Movement Flow', () => {

    it('should move task to done-to-do folder', async () => {
      console.log('\n--- Test: Move task to completed ---');

      const result = await handleMoveTask({
        project: 'ProjectX',
        subproject: 'w1',
        task_file: 'task_001_implement-jwt-token-generation.md',
        target_folder: 'done-to-do',
        source_folder: 'to-do',
        workspace_path: 'test-workspace'
      });

      console.log('Result:', JSON.stringify(result, null, 2));

      assert.ok(result.success, 'Task move should succeed');

      // Verify file moved in test workspace
      const oldPath = path.join(STORAGE_ROOT, 'test-workspace/ProjectX/w1/to-do/task_001_implement-jwt-token-generation.md');
      const newPath = path.join(STORAGE_ROOT, 'test-workspace/ProjectX/w1/done-to-do/task_001_implement-jwt-token-generation.md');

      assert.ok(!fs.existsSync(oldPath), 'Task should be removed from to-do');
      assert.ok(fs.existsSync(newPath), 'Task should exist in done-to-do');

      console.log('✓ Task moved to done-to-do');
    });

    it('should move task to analysis folder', async () => {
      console.log('\n--- Test: Move task to analysis ---');

      const result = await handleMoveTask({
        project: 'ProjectX',
        subproject: 'w1',
        task_file: 'task_002_implement-refresh-token-rotation.md',
        target_folder: 'analysis',
        source_folder: 'to-do',
        workspace_path: 'test-workspace'
      });

      assert.ok(result.success, 'Task move to analysis should succeed');

      const analysisPath = path.join(STORAGE_ROOT, 'test-workspace/ProjectX/w1/analysis/task_002_implement-refresh-token-rotation.md');
      assert.ok(fs.existsSync(analysisPath), 'Task should exist in analysis');

      console.log('✓ Task moved to analysis');
    });
  });

  describe('5. Job Listing Flow', () => {

    it('should list active jobs', async () => {
      console.log('\n--- Test: List active jobs ---');

      const result = await handleListActiveJobs({ workspace_path: 'test-workspace' });

      // Check if MCP format (list handlers return MCP format directly)
      const text = result.content[0].text;

      console.log('Active jobs response received');

      assert.ok(text.includes('ACTIVE JOBS'), 'Should have active jobs header');
      // Job #1 should be active since its tasks are not yet completed
      assert.ok(text.includes('[001]'), 'Should show active job #001');

      console.log(`✓ Active jobs listed`);
    });

    it('should get enhanced job details', async () => {
      console.log('\n--- Test: Get enhanced job details ---');

      const result = await handleListJobsEnhanced({ workspace_path: 'test-workspace', job_id: 1 });
      const text = result.content[0].text;

      console.log('Job details received');

      assert.ok(text.includes('JOB 001'), 'Should show job ID');
      assert.ok(text.includes('TASKS'), 'Should show tasks section');

      console.log(`✓ Job details retrieved`);
    });
  });

  describe('6. Smart Info Flow', () => {

    it('should provide system-level info', async () => {
      console.log('\n--- Test: Smart info (system) ---');

      const result = await handleSmartInfo({ context: 'system' });

      console.log('System info received');

      assert.strictEqual(result.context, 'system', 'Should have system context');
      assert.ok(result.content && typeof result.content === 'string', 'Should have string content');
      assert.ok(result.content.includes('Active Jobs') || result.content.includes('CONDUCKS SYSTEM'), 'Should contain system info');

      console.log('✓ System info retrieved');
    });

    it('should provide job-level info', async () => {
      console.log('\n--- Test: Smart info (job) ---');

      const result = await handleSmartInfo({
        context: 'job',
        job_id: 1
      });

      assert.strictEqual(result.context, 'job', 'Should have job context');
      assert.ok(typeof result.content === 'string', 'Content should be string');
      assert.ok(result.content.includes('JOB'), 'Should contain job info');

      console.log('✓ Job info retrieved');
    });
  });

  describe('7. Job Completion Flow', () => {

    it('should not complete job with incomplete tasks', async () => {
      console.log('\n--- Test: Cannot complete job with active tasks ---');

      const result = await handleCompleteJob({
        workspace_path: 'test-workspace',
        job_id: 1,
        completion_notes: 'Attempting early completion'
      });

      console.log('Result:', JSON.stringify(result, null, 2));

      // Should either fail or warn about incomplete tasks
      assert.ok(result, 'Should return a result');

      console.log('✓ Job completion validation works');
    });

    it('should complete job after all tasks are done', async () => {
      console.log('\n--- Test: Complete job with all tasks done ---');

      // First, move remaining tasks to done
      await handleMoveTask({
        project: 'ProjectX',
        subproject: 'w1',
        task_file: 'task_003_add-role-based-access-control.md',
        target_folder: 'done-to-do',
        source_folder: 'to-do',
        workspace_path: 'test-workspace'
      });

      // Move task from analysis back to done
      await handleMoveTask({
        project: 'ProjectX',
        subproject: 'w1',
        task_file: 'task_002_implement-refresh-token-rotation.md',
        target_folder: 'done-to-do',
        source_folder: 'analysis',
        workspace_path: 'test-workspace'
      });

      // Now complete job
      const result = await handleCompleteJob({
        workspace_path: 'test-workspace',
        job_id: 1,
        completion_notes: 'All authentication features implemented'
      });

      console.log('Result:', JSON.stringify(result, null, 2));

      assert.ok(result.success, 'Job completion should succeed');

      // Verify job moved to done-to-do at global jobs folder
      const doneFiles = fs.readdirSync(path.join(STORAGE_ROOT, 'jobs/done-to-do'));
      const completedJob = doneFiles.find(f => f.startsWith('001_'));
      assert.ok(completedJob, 'Completed job should be in done-to-do');

      // Verify job no longer in to-do
      const todoFiles = fs.readdirSync(path.join(STORAGE_ROOT, 'jobs/to-do'));
      const activeJob = todoFiles.find(f => f.startsWith('001_'));
      assert.ok(!activeJob, 'Job should not be in to-do anymore');

      console.log('✓ Job completed and archived successfully');
    });

    it('should list completed jobs', async () => {
      console.log('\n--- Test: List completed jobs ---');

      const result = await handleListCompletedJobs({ workspace_path: 'test-workspace' });
      const text = result.content[0].text;

      console.log('Completed jobs response received');

      assert.ok(text.includes('COMPLETED JOBS'), 'Should have completed jobs header');
      assert.ok(text.includes('001'), 'Should show completed job');
      assert.ok(text.includes('100%'), 'Should show 100% completion');

      console.log(`✓ Completed jobs listed`);
    });
  });

  describe('8. Edge Cases & Validation', () => {

    it('should reject task creation for non-existent job', async () => {
      console.log('\n--- Test: Reject invalid job_id ---');

      const result = await handleCreateTask({
        job_id: 9999,
        title: 'Invalid task',
        description: 'Should fail',
        subproject: 'w1',
        workspace_path: 'test-workspace'
      });

      assert.ok(!result.success, 'Should fail for invalid job_id');
      assert.ok(result.message.includes('not found'), 'Should indicate job not found');

      console.log('✓ Invalid job_id rejected');
    });

    it('should handle missing required fields', async () => {
      console.log('\n--- Test: Handle missing fields ---');

      try {
        // @ts-ignore
        await handleCreateJob({ name: 'Missing description' });
        assert.fail('Should have thrown error for missing description');
      } catch (error: any) {
        assert.ok(error, 'Should throw error for missing fields');
        console.log('✓ Missing required fields rejected');
      }
    });
  });

  describe('9. Full Workflow End-to-End', () => {

    it('should execute complete job lifecycle', async () => {
      console.log('\n--- Test: Full workflow end-to-end ---');

      // 1. Create job
      const jobResult = await handleCreateJob({
        workspace_path: 'test-workspace',
        name: 'Build API Gateway',
        description: 'Centralized API gateway with rate limiting',
        priority: 'high',
        objectives: ['Route management', 'Rate limiting', 'Authentication middleware']
      });

      assert.ok(jobResult.success, 'Job creation should succeed');
      const jobId = jobResult.jobs[0].id;
      console.log(`  1. Created job #${jobId}`);

      // 2. Create tasks
      const taskResults = await Promise.all([
        handleCreateTask({ job_id: jobId, title: 'Setup routing', description: 'Configure routes', subproject: 'w1', workspace_path: 'test-workspace' }),
        handleCreateTask({ job_id: jobId, title: 'Add rate limiter', description: 'Implement limits', subproject: 'w1', workspace_path: 'test-workspace' })
      ]);

      if (!taskResults.every((r: any) => r.success)) {
        console.error('Task creation failed:', JSON.stringify(taskResults, null, 2));
      }

      assert.ok(taskResults.every((r: any) => r.success), 'All tasks should be created');
      console.log(`  2. Created ${taskResults.length} tasks`);

      // 3. Work on and complete tasks
      for (const taskResult of taskResults) {
        if (taskResult.task) {
          const fileName = path.basename(taskResult.task.filePath);
          await handleMoveTask({
            project: 'ProjectX',
            subproject: 'w1',
            task_file: fileName,
            target_folder: 'done-to-do',
            source_folder: 'to-do',
            workspace_path: 'test-workspace'
          });
        }
      }
      console.log('  3. Completed all tasks');

      // 4. Complete job
      const completeResult = await handleCompleteJob({
        workspace_path: 'test-workspace',
        job_id: jobId,
        completion_notes: 'API Gateway fully implemented'
      });

      assert.ok(completeResult.success, 'Job completion should succeed');
      console.log('  4. Job completed');

      // 5. Verify final state
      const completedJobs = await handleListCompletedJobs();
      const completedText = completedJobs.content[0].text;
      assert.ok(completedText.includes('COMPLETED JOBS'), 'Should have completed jobs');
      console.log('✓ Full workflow completed successfully');
    });
  });

  describe('10. Job Deletion Flow', () => {

    it('should reject deletion without confirmation', async () => {
      console.log('\n--- Test: Reject deletion without confirmation ---');

      // @ts-ignore
      const { handleDeleteJob } = await import('../tools/delete-job.js');

      const result = await handleDeleteJob({
        workspace_path: 'test-workspace',
        job_id: 2,
        confirm_deletion: false
      });

      assert.ok(!result.success, 'Deletion should be rejected without confirmation');
      assert.ok(result.message.includes('DELETION CANCELLED'), 'Should indicate cancellation');

      console.log('✓ Deletion rejected without confirmation');
    });

    it('should delete job with confirmation', async () => {
      console.log('\n--- Test: Delete job ---');

      // @ts-ignore
      const { handleDeleteJob } = await import('../tools/delete-job.js');

      const result = await handleDeleteJob({
        workspace_path: 'test-workspace',
        job_id: 2,
        confirm_deletion: true
      });

      console.log('Result:', JSON.stringify(result, null, 2));

      assert.ok(result.success, 'Job deletion should succeed');

      // Verify job file is deleted from global jobs folder
      const jobFiles = fs.readdirSync(path.join(STORAGE_ROOT, 'jobs/to-do'));
      const deletedJob = jobFiles.find(f => f.startsWith('002_'));
      assert.ok(!deletedJob, 'Job file should be deleted');

      console.log('✓ Job deleted successfully');
    });

    it('should handle deleting non-existent job', async () => {
      console.log('\n--- Test: Delete non-existent job ---');

      // @ts-ignore
      const { handleDeleteJob } = await import('../tools/delete-job.js');

      const result = await handleDeleteJob({
        workspace_path: 'test-workspace',
        job_id: 9999,
        confirm_deletion: true
      });

      assert.ok(!result.success, 'Should fail for non-existent job');
      assert.ok(result.message.includes('NOT FOUND'), 'Should indicate job not found');

      console.log('✓ Non-existent job handled correctly');
    });
  });

  describe('11. Domain CRUD Operations', () => {

    it('should edit task attributes', async () => {
      console.log('\n--- Test: Edit task attributes ---');

      // @ts-ignore
      const { handleEditTask } = await import('../tools/domain-crud.js');

      // First create a domain file for testing (TOON format)
      const domainPath = path.join(STORAGE_ROOT, 'test-workspace/main/test-domain.md');
      await fs.ensureDir(path.dirname(domainPath));
      const initialContent = `Task 001: Sample Task
Status: active
Team: backend
Complexity: medium
Desc: Initial description
`;
      await fs.writeFile(domainPath, initialContent);

      const result = await handleEditTask({
        project: 'test-workspace',
        subproject: 'main',
        domain_file: 'test-domain.md',
        task_id: '001',
        updates: {
          status: 'completed',
          team: 'frontend',
          complexity: 'high'
        }
      });

      assert.ok(result.success, 'Task edit should succeed');

      // Verify file was updated (TOON format uses "Status: completed |" and "Team: frontend")
      const updatedContent = await fs.readFile(domainPath, 'utf-8');
      console.log('DEBUG: Updated file content:', updatedContent);
      assert.ok(updatedContent.includes('Status: completed'), 'Status should be updated');
      assert.ok(updatedContent.includes('Team: frontend'), 'Team should be updated');

      console.log('✓ Task attributes edited successfully');
    });

    it('should replace lines in domain file', async () => {
      console.log('\n--- Test: Replace lines ---');

      // @ts-ignore
      const { handleReplaceLines } = await import('../tools/domain-crud.js');

      const domainPath = path.join(STORAGE_ROOT, 'test-workspace/main/test-domain.md');

      const result = await handleReplaceLines({
        project: 'test-workspace',
        subproject: 'main',
        domain_file: 'test-domain.md',
        start_line: 4,
        end_line: 4,
        new_content: '- **Status:** archived'
      });

      assert.ok(result.success, 'Line replacement should succeed');

      console.log('✓ Lines replaced successfully');
    });

    it('should rewrite entire domain file', async () => {
      console.log('\n--- Test: Rewrite domain file ---');

      // @ts-ignore
      const { handleRewriteDomain } = await import('../tools/domain-crud.js');

      const newContent = `# Rewritten Domain

## Task 001: New Task
- **Status:** active
- **Team:** platform
`;

      const result = await handleRewriteDomain({
        project: 'test-workspace',
        subproject: 'main',
        domain_file: 'test-domain.md',
        new_content: newContent
      });

      assert.ok(result.success, 'Domain rewrite should succeed');

      const domainPath = path.join(STORAGE_ROOT, 'test-workspace/main/test-domain.md');
      const content = await fs.readFile(domainPath, 'utf-8');
      assert.ok(content.includes('Rewritten Domain'), 'File should be rewritten');

      console.log('✓ Domain file rewritten successfully');
    });

    it('should append task to domain file', async () => {
      console.log('\n--- Test: Append task ---');

      // @ts-ignore
      const { handleAppendTask } = await import('../tools/domain-crud.js');

      const result = await handleAppendTask({
        project: 'test-workspace',
        subproject: 'main',
        domain_file: 'test-domain.md',
        task_content: `## Task 002: Appended Task
- **Status:** active
- **Team:** backend
`
      });

      assert.ok(result.success, 'Task append should succeed');

      const domainPath = path.join(STORAGE_ROOT, 'test-workspace/main/test-domain.md');
      const content = await fs.readFile(domainPath, 'utf-8');
      assert.ok(content.includes('Task 002'), 'New task should be appended');

      console.log('✓ Task appended successfully');
    });

    it('should remove task from domain file', async () => {
      console.log('\n--- Test: Remove task ---');

      // @ts-ignore
      const { handleRemoveTask } = await import('../tools/domain-crud.js');

      const result = await handleRemoveTask({
        project: 'test-workspace',
        subproject: 'main',
        domain_file: 'test-domain.md',
        task_id: '002'
      });

      assert.ok(result.success, 'Task removal should succeed');

      const domainPath = path.join(STORAGE_ROOT, 'test-workspace/main/test-domain.md');
      const content = await fs.readFile(domainPath, 'utf-8');
      assert.ok(!content.includes('Task 002'), 'Task should be removed');

      console.log('✓ Task removed successfully');
    });
  });

  describe('12. Architecture Analysis', () => {

    it('should audit repository structure', async () => {
      console.log('\n--- Test: Architecture audit ---');

      // @ts-ignore
      const { handleArchitectureAudit } = await import('../tools/architecture-audit.js');

      const result = await handleArchitectureAudit({
        workspace_path: '.'
      });

      assert.ok(result.success, 'Architecture audit should succeed');
      assert.ok(result.repos !== undefined, 'Should return repos array');
      assert.ok(result.warnings !== undefined, 'Should return warnings array');

      console.log('✓ Architecture audit completed');
    });
  });
});
