// Job Management Tools Test Suite
// Tests all job management functionality with the new architecture

import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { loadCONDUCKSWorkspace, saveJobForWorkspace, getNextJobIdForWorkspace } from '../src/core/storage.js';
import { handleCreateJob, formatCreateJobResult } from '../src/tools/create-job.js';
import { handleCreateTask, formatCreateTaskResult } from '../src/tools/create-task.js';
import { handleCompleteJob, formatCompleteJobResult } from '../src/tools/complete-job.js';
import { handleDeleteJob, formatDeleteJobResult } from '../src/tools/delete-job.js';
import { handleEditTask, formatEditTaskResult } from '../src/tools/domain-crud.js';
import { handleListActiveJobs } from '../src/tools/list-active-jobs.js';
import { handleListCompletedJobs } from '../src/tools/list-completed-jobs.js';
import { handleListJobsEnhanced } from '../src/tools/list-jobs-enhanced.js';

// Test workspace setup
const TEST_WORKSPACE = 'test-workspace';
const TEST_STORAGE_DIR = '/Users/saidmustafa/Documents/Gospel_Of_Technology/CONDUCKS/conducks/storage';

// Cleanup function
function cleanupTestWorkspace() {
  try {
    const workspacePath = join(TEST_STORAGE_DIR, TEST_WORKSPACE);
    if (existsSync(workspacePath)) {
      rmSync(workspacePath, { recursive: true, force: true });
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

// Setup function
function setupTestWorkspace() {
  cleanupTestWorkspace();
  const workspacePath = join(TEST_STORAGE_DIR, TEST_WORKSPACE);
  mkdirSync(workspacePath, { recursive: true });
  mkdirSync(join(workspacePath, 'jobs', 'to-do'), { recursive: true });
  mkdirSync(join(workspacePath, 'jobs', 'done-to-do'), { recursive: true });
  mkdirSync(join(workspacePath, 'ProjectX', 'w1', 'to-do'), { recursive: true });
}

// Test suite
async function runJobManagementTests() {
  console.log('🧪 Starting Job Management Tools Test Suite...\n');

  setupTestWorkspace();

  let testResults = {
    passed: 0,
    failed: 0,
    total: 0
  };

  // Test 1: Create Job
  console.log('📝 Test 1: Create Job');
  testResults.total++;
  try {
    const createJobResult = await handleCreateJob({
      workspace_id: TEST_WORKSPACE,
      name: 'Test Job',
      description: 'A test job for validation',
      domain: 'testing',
      priority: 'high'
    });

    if (createJobResult.success && createJobResult.jobs.length > 0) {
      console.log('✅ Job created successfully');
      testResults.passed++;
    } else {
      console.log('❌ Job creation failed:', createJobResult.message);
      testResults.failed++;
    }
  } catch (error) {
    console.log('❌ Job creation error:', error);
    testResults.failed++;
  }

  // Test 2: Load Workspace
  console.log('\n📂 Test 2: Load Workspace');
  testResults.total++;
  try {
    const workspace = await loadCONDUCKSWorkspace(TEST_WORKSPACE);
    if (workspace.jobs.length > 0) {
      console.log('✅ Workspace loaded successfully');
      testResults.passed++;
    } else {
      console.log('❌ Workspace loading failed - no jobs found');
      testResults.failed++;
    }
  } catch (error) {
    console.log('❌ Workspace loading error:', error);
    testResults.failed++;
  }

  // Test 3: Create Task
  console.log('\n📋 Test 3: Create Task');
  testResults.total++;
  try {
    const createTaskResult = await handleCreateTask({
      workspace_id: TEST_WORKSPACE,
      job_id: 1,
      title: 'Test Task',
      description: 'A test task for validation',
      priority: 'high',
      complexity: 'medium',
      team: 'platform'
    });

    if (createTaskResult.success) {
      console.log('✅ Task created successfully');
      testResults.passed++;
    } else {
      console.log('❌ Task creation failed:', createTaskResult.message);
      testResults.failed++;
    }
  } catch (error) {
    console.log('❌ Task creation error:', error);
    testResults.failed++;
  }

  // Test 4: Edit Task
  console.log('\n✏️ Test 4: Edit Task');
  testResults.total++;
  try {
    const editTaskResult = await handleEditTask({
      project: 'test-project',
      subproject: 'w1',
      domain_file: 'test-domain',
      task_id: 1,
      updates: {
        status: 'completed',
        team: 'frontend',
        complexity: 'simple'
      }
    });

    if (editTaskResult.success) {
      console.log('✅ Task edited successfully');
      testResults.passed++;
    } else {
      console.log('❌ Task editing failed:', editTaskResult.message);
      testResults.failed++;
    }
  } catch (error) {
    console.log('❌ Task editing error:', error);
    testResults.failed++;
  }

  // Test 5: List Active Jobs
  console.log('\n📊 Test 5: List Active Jobs');
  testResults.total++;
  try {
    const listActiveResult = await handleListActiveJobs({
      workspace_id: TEST_WORKSPACE
    });

    if (listActiveResult && listActiveResult.content[0].text.includes('ACTIVE JOBS')) {
      console.log('✅ Active jobs listed successfully');
      testResults.passed++;
    } else {
      console.log('❌ Active jobs listing failed');
      testResults.failed++;
    }
  } catch (error) {
    console.log('❌ Active jobs listing error:', error);
    testResults.failed++;
  }

  // Test 6: List Completed Jobs
  console.log('\n📈 Test 6: List Completed Jobs');
  testResults.total++;
  try {
    const listCompletedResult = await handleListCompletedJobs({
      workspace_id: TEST_WORKSPACE
    });

    if (listCompletedResult && listCompletedResult.content[0].text.includes('COMPLETED JOBS')) {
      console.log('✅ Completed jobs listed successfully');
      testResults.passed++;
    } else {
      console.log('❌ Completed jobs listing failed');
      testResults.failed++;
    }
  } catch (error) {
    console.log('❌ Completed jobs listing error:', error);
    testResults.failed++;
  }

  // Test 7: List Jobs Enhanced
  console.log('\n🔍 Test 7: List Jobs Enhanced');
  testResults.total++;
  try {
    const listEnhancedResult = await handleListJobsEnhanced({
      workspace_id: TEST_WORKSPACE
    });

    if (listEnhancedResult && listEnhancedResult.content[0].text.includes('JOBS OVERVIEW')) {
      console.log('✅ Enhanced jobs listed successfully');
      testResults.passed++;
    } else {
      console.log('❌ Enhanced jobs listing failed');
      testResults.failed++;
    }
  } catch (error) {
    console.log('❌ Enhanced jobs listing error:', error);
    testResults.failed++;
  }

  // Test 8: Complete Job
  console.log('\n✅ Test 8: Complete Job');
  testResults.total++;
  try {
    const completeJobResult = await handleCompleteJob({
      workspace_id: TEST_WORKSPACE,
      job_id: 1,
      completion_notes: 'Test completion'
    });

    if (completeJobResult.success) {
      console.log('✅ Job completed successfully');
      testResults.passed++;
    } else {
      console.log('❌ Job completion failed:', completeJobResult.message);
      testResults.failed++;
    }
  } catch (error) {
    console.log('❌ Job completion error:', error);
    testResults.failed++;
  }

  // Test 9: Delete Job
  console.log('\n🗑️ Test 9: Delete Job');
  testResults.total++;
  try {
    const deleteJobResult = await handleDeleteJob({
      workspace_id: TEST_WORKSPACE,
      job_id: 1,
      confirm_deletion: true
    });

    if (deleteJobResult.success) {
      console.log('✅ Job deleted successfully');
      testResults.passed++;
    } else {
      console.log('❌ Job deletion failed:', deleteJobResult.message);
      testResults.failed++;
    }
  } catch (error) {
    console.log('❌ Job deletion error:', error);
    testResults.failed++;
  }

  // Test 10: Final Workspace State
  console.log('\n🏁 Test 10: Final Workspace State');
  testResults.total++;
  try {
    const finalWorkspace = await loadCONDUCKSWorkspace(TEST_WORKSPACE);
    if (finalWorkspace.jobs.length === 0) {
      console.log('✅ Workspace cleaned up successfully');
      testResults.passed++;
    } else {
      console.log('❌ Workspace cleanup failed - jobs remain');
      testResults.failed++;
    }
  } catch (error) {
    console.log('❌ Final workspace check error:', error);
    testResults.failed++;
  }

  // Cleanup
  cleanupTestWorkspace();

  // Results
  console.log('\n📊 Test Results Summary');
  console.log('='.repeat(50));
  console.log(`Total Tests: ${testResults.total}`);
  console.log(`Passed: ${testResults.passed} ✅`);
  console.log(`Failed: ${testResults.failed} ❌`);
  console.log(`Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);

  if (testResults.failed === 0) {
    console.log('\n🎉 All tests passed! Job management tools are working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the errors above.');
  }

  return testResults;
}

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
  runJobManagementTests().catch(console.error);
}

export { runJobManagementTests, setupTestWorkspace, cleanupTestWorkspace };
