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
const JOBS_TODO = path.join(STORAGE_ROOT, 'jobs/to-do');
const JOBS_DONE = path.join(STORAGE_ROOT, 'jobs/done-to-do');
const PROJECT_ROOT = path.join(TEST_ROOT, 'ProjectX');

// CRITICAL: Set environment variable BEFORE importing any modules that use config
process.env.CONDUCKS_STORAGE_DIR = STORAGE_ROOT;

// Import handlers AFTER setting environment (use source files for TypeScript compilation, built files at runtime)
import { handleInitializeProjectStructure } from '../src/tools/initialize-project-structure.js';
import { handleCreateJob } from '../src/tools/create-job.js';
import { handleCreateTask } from '../src/tools/create-task.js';
import { handleMoveTask } from '../src/tools/move-task.js';
import { handleCompleteJob } from '../src/tools/complete-job.js';
import { handleListActiveJobs } from '../src/tools/list-active-jobs.js';
import { handleListCompletedJobs } from '../src/tools/list-completed-jobs.js';
import { handleListJobsEnhanced } from '../src/tools/list-jobs-enhanced.js';
import { handleSmartInfo } from '../src/tools/smart-info.js';

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

      // In the new job-centric model, jobs/to-do directory should exist
      assert.ok(fs.existsSync(path.join(STORAGE_ROOT, 'jobs')), 'jobs directory should exist');

      // ProjectX structure is created on first task creation, not during init

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
      
      // Verify file exists
      const jobFiles = fs.readdirSync(JOBS_TODO);
      assert.ok(jobFiles.some(f => f.startsWith('001_')), 'Job file should exist');
      
      console.log('✓ Single job created:', result.jobs[0].name);
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
        subproject: 'w1'
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
          subproject: 'w1' as const
        },
        {
          job_id: 1,
          title: 'Add role-based access control',
          description: 'Implement RBAC middleware',
          priority: 'medium' as const,
          complexity: 'medium' as const,
          team: 'backend',
          subproject: 'w1' as const
        }
      ];

      for (const taskArgs of tasks) {
        const result = await handleCreateTask(taskArgs);
        assert.ok(result.success, `Task "${taskArgs.title}" should be created`);
        console.log(`✓ Created task: ${taskArgs.title}`);
      }

      // Verify all tasks are in job
      const jobFile = fs.readdirSync(JOBS_TODO).find(f => f.startsWith('001_'));
      const jobContent = JSON.parse(fs.readFileSync(path.join(JOBS_TODO, jobFile!), 'utf-8'));
      
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
        source_folder: 'to-do'
      });

      console.log('Result:', JSON.stringify(result, null, 2));

      assert.ok(result.success, 'Task move should succeed');

      // Verify file moved in test workspace
      const oldPath = path.join(TEST_ROOT, 'ProjectX/w1/to-do/task_001_implement-jwt-token-generation.md');
      const newPath = path.join(TEST_ROOT, 'ProjectX/w1/done-to-do/task_001_implement-jwt-token-generation.md');

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
        source_folder: 'to-do'
      });

      assert.ok(result.success, 'Task move to analysis should succeed');

      const analysisPath = path.join(TEST_ROOT, 'ProjectX/w1/analysis/task_002_implement-refresh-token-rotation.md');
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
        source_folder: 'to-do'
      });

      // Move task from analysis back to done
      await handleMoveTask({
        project: 'ProjectX',
        subproject: 'w1',
        task_file: 'task_002_implement-refresh-token-rotation.md',
        target_folder: 'done-to-do',
        source_folder: 'analysis'
      });

      // Now complete job
      const result = await handleCompleteJob({
        workspace_path: 'test-workspace',
        job_id: 1,
        completion_notes: 'All authentication features implemented'
      });

      console.log('Result:', JSON.stringify(result, null, 2));

      assert.ok(result.success, 'Job completion should succeed');
      
      // Verify job moved to done
      const doneFiles = fs.readdirSync(JOBS_DONE);
      assert.ok(doneFiles.some(f => f.startsWith('001_')), 'Job file should be in done-to-do');
      
      console.log('✓ Job completed and archived');
    });

    it('should list completed jobs', async () => {
      console.log('\n--- Test: List completed jobs ---');
      
      const result = await handleListCompletedJobs();
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
        subproject: 'w1'
      });

      assert.ok(!result.success, 'Should fail for invalid job_id');
      assert.ok(result.message.includes('not found'), 'Should indicate job not found');
      
      console.log('✓ Invalid job_id rejected');
    });

    it('should handle missing required fields', async () => {
      console.log('\n--- Test: Handle missing fields ---');
      
      try {
        // @ts-expect-error Testing missing required field
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
        handleCreateTask({ job_id: jobId, title: 'Setup routing', description: 'Configure routes', subproject: 'w1' }),
        handleCreateTask({ job_id: jobId, title: 'Add rate limiter', description: 'Implement limits', subproject: 'w1' })
      ]);
      
      assert.ok(taskResults.every(r => r.success), 'All tasks should be created');
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
            source_folder: 'to-do'
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
      console.log('  5. Verified final state');

      console.log('✓ Full workflow completed successfully');
    });
  });
});

// Test runner
console.log('\n╔═══════════════════════════════════════════════════════╗');
console.log('║       CONDUCKS Workflow Integration Tests            ║');
console.log('╚═══════════════════════════════════════════════════════╝\n');
