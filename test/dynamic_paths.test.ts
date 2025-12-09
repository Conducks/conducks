
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test workspace paths
const TEST_ROOT = path.join(__dirname, '../test-workspace-dynamic');
const STORAGE_ROOT = path.join(TEST_ROOT, 'storage');

// CRITICAL: Set environment variable BEFORE importing any modules that use config
process.env.CONDUCKS_STORAGE_ROOT = STORAGE_ROOT;

// Import handlers
// @ts-ignore
import { handleCreateJob } from '../tools/create-job.js';
// @ts-ignore
import { handleCreateTask } from '../tools/create-task.js';
// @ts-ignore
import { handleMoveTask } from '../tools/move-task.js';

describe('CONDUCKS Dynamic Project Paths', () => {

    before(async () => {
        console.log('\n=== Setting up dynamic test workspace ===');
        await fs.remove(TEST_ROOT);
        await fs.ensureDir(TEST_ROOT);
        await fs.ensureDir(STORAGE_ROOT);
    });

    after(async () => {
        // await fs.remove(TEST_ROOT);
    });

    it('should create task in custom project directory', async () => {
        console.log('\n--- Test: Create task in custom project ---');

        // 1. Create Job
        const jobResult = await handleCreateJob({
            workspace_path: 'test-workspace',
            name: 'Custom Project Job',
            description: 'Job for custom project',
            priority: 'high'
        });
        if (!jobResult.success) console.error('Dynamic Job Create Failed:', jobResult);
        assert.ok(jobResult.success);
        const jobId = jobResult.jobs[0].id;

        // 2. Create Task with custom project
        const taskResult = await handleCreateTask({
            job_id: jobId,
            title: 'Custom Project Task',
            description: 'Task in custom project',
            subproject: 'backend',
            project: 'MyCustomApp', // Custom project name
            workspace_path: 'test-workspace'
        });

        console.log('Task Result:', JSON.stringify(taskResult, null, 2));

        assert.ok(taskResult.success, 'Task creation should succeed');

        // 3. Verify file location
        const expectedPath = path.join(STORAGE_ROOT, 'test-workspace/MyCustomApp/backend/to-do');
        const files = await fs.readdir(expectedPath);
        const taskFile = files.find(f => f.includes('custom-project-task'));

        assert.ok(taskFile, 'Task file should exist in custom project directory');
        console.log(`✓ Verified task file in: ${expectedPath}`);
    });

    it('should move task in custom project directory', async () => {
        console.log('\n--- Test: Move task in custom project ---');

        const files = await fs.readdir(path.join(STORAGE_ROOT, 'test-workspace/MyCustomApp/backend/to-do'));
        const taskFile = files.find(f => f.includes('custom-project-task'));

        const moveResult = await handleMoveTask({
            project: 'MyCustomApp', // Custom project name
            subproject: 'backend',
            task_file: taskFile!,
            target_folder: 'done-to-do',
            source_folder: 'to-do',
            workspace_path: 'test-workspace'
        });

        assert.ok(moveResult.success, 'Move should succeed');

        const oldPath = path.join(STORAGE_ROOT, 'test-workspace/MyCustomApp/backend/to-do', taskFile!);
        const newPath = path.join(STORAGE_ROOT, 'test-workspace/MyCustomApp/backend/done-to-do', taskFile!);

        assert.ok(!fs.existsSync(oldPath), 'Should be removed from to-do');
        assert.ok(fs.existsSync(newPath), 'Should exist in done-to-do');
        console.log('✓ Verified task move in custom project');
    });
});
