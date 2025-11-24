/** @format */

// Simple test script to verify job management functionality
import { loadCONDUCKSWorkspace } from './src/core/storage.js';
import { handleCreateJob } from './src/tools/create-job.js';
import { handleCreateTask } from './src/tools/create-task.js';

async function testBasicFunctionality() {
	console.log('🧪 Testing basic job management functionality...\n');

	try {
		// Test 1: Create a job
		console.log('📝 Test 1: Create Job');
		const createJobResult = await handleCreateJob({
			workspace_path: 'test-workspace',
			name: 'Test Job',
			description: 'A test job for validation',
			domain: 'testing',
			priority: 'high',
		});

		if (createJobResult.success) {
			console.log('✅ Job created successfully:', createJobResult.message);
		} else {
			console.log('❌ Job creation failed:', createJobResult.message);
			return;
		}

		// Test 2: Load workspace
		console.log('\n📂 Test 2: Load Workspace');
		const workspace = await loadCONDUCKSWorkspace('test-workspace');
		console.log(
			'✅ Workspace loaded successfully with',
			workspace.jobs.length,
			'jobs'
		);

		// Test 3: Create a task
		console.log('\n📋 Test 3: Create Task');
		const createTaskResult = await handleCreateTask({
			workspace_path: 'test-workspace',
			job_id: 1,
			title: 'Test Task',
			description: 'A test task for validation',
			priority: 'high',
			complexity: 'medium',
			team: 'platform',
		});

		if (createTaskResult.success) {
			console.log('✅ Task created successfully:', createTaskResult.message);
		} else {
			console.log('❌ Task creation failed:', createTaskResult.message);
		}

		// Test 4: Final workspace state
		console.log('\n🏁 Test 4: Final Workspace State');
		const finalWorkspace = await loadCONDUCKSWorkspace('test-workspace');
		console.log(
			'✅ Final workspace state:',
			finalWorkspace.jobs.length,
			'jobs'
		);

		for (const job of finalWorkspace.jobs) {
			console.log(`  Job ${job.id}: ${job.title} (${job.tasks.length} tasks)`);
		}

		console.log('\n🎉 Basic functionality test completed!');
	} catch (error) {
		console.error('❌ Test failed with error:', error);
	}
}

// Run the test
testBasicFunctionality().catch(console.error);
