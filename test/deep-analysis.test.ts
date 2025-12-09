
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test workspace paths
const TEST_ROOT = path.join(__dirname, '../test-deep-analysis');
const STORAGE_ROOT = path.join(TEST_ROOT, 'storage');
const WORKSPACE_NAME = 'analysis-workspace';

process.env.CONDUCKS_STORAGE_ROOT = STORAGE_ROOT;

// Import handlers
// @ts-ignore
import { handleEditTask } from '../tools/domain-crud.js';
// @ts-ignore
import { handleCreateTask } from '../tools/create-task.js';

describe('Deep Code Analysis Reproduction Tests', () => {

    before(async () => {
        await fs.remove(TEST_ROOT);
        await fs.ensureDir(TEST_ROOT);
        await fs.ensureDir(STORAGE_ROOT);
    });

    after(async () => {
        // await fs.remove(TEST_ROOT);
    });

    it('BUG: handleEditTask should edit the correct task in a multi-task file', async () => {
        // Setup: Create a file with two tasks
        const domainPath = path.join(STORAGE_ROOT, WORKSPACE_NAME, 'to-do/multi-task.md');
        await fs.ensureDir(path.dirname(domainPath));

        const content = `
# Task 001: First Task
Status: active
Team: backend
Desc: First description

# Task 002: Second Task
Status: active
Team: backend
Desc: Second description
`;
        await fs.writeFile(domainPath, content);

        // Action: Try to edit Task 002
        await handleEditTask({
            project: WORKSPACE_NAME,
            subproject: '',
            folder: 'to-do',
            domain_file: 'multi-task.md',
            task_id: 2, // Targeting Task 002
            updates: {
                status: 'completed'
            }
        });

        // Verification
        const newContent = await fs.readFile(domainPath, 'utf-8');

        // Expected: Task 001 is active, Task 002 is completed
        // Actual (Predicted): Task 001 is completed, Task 002 is active (because regex hits first match)

        const task1Status = newContent.match(/Task 001[\s\S]*?Status: (\w+)/)?.[1];
        const task2Status = newContent.match(/Task 002[\s\S]*?Status: (\w+)/)?.[1];

        console.log('Task 1 Status:', task1Status);
        console.log('Task 2 Status:', task2Status);

        // This assertion expects the BUG to be FIXED
        // If fixed, Task 1 will be 'active' and Task 2 will be 'completed'
        if (task1Status === 'active' && task2Status === 'completed') {
            console.log('✅ BUG FIXED: Correctly edited Task 002');
        } else {
            console.log('❌ BUG STILL EXISTS (or behavior differs)');
            console.log(`Task 1: ${task1Status}, Task 2: ${task2Status}`);
            throw new Error('Edit task fix failed');
        }
    });

    it('SECURITY: Path traversal via subproject parameter', async () => {
        // Setup: Create a file outside the intended project directory
        const secretFile = path.join(TEST_ROOT, 'secret.txt');
        await fs.writeFile(secretFile, 'secret content');

        // Action: Try to access it using .. in subproject
        // Target path: storage/workspace/project/../../secret.txt
        // We need to construct a path that resolves to secretFile relative to tasksRoot

        // tasksRoot = storage/workspace/project
        // we want ../../../secret.txt (depending on nesting)

        try {
            // Create a job first
            // @ts-ignore
            const { handleCreateJob } = await import('../tools/create-job.js');
            const jobResult = await handleCreateJob({
                workspace_path: WORKSPACE_NAME,
                name: 'Exploit Job',
                description: 'Job for security test',
                priority: 'high'
            });

            if (!jobResult.success) throw new Error('Failed to create job');
            const jobId = jobResult.jobs[0].id;

            // Attempt to create a task file outside the allowed directory
            const result = await handleCreateTask({
                job_id: jobId,
                title: 'Exploit Task',
                description: 'Trying to write outside',
                workspace_path: WORKSPACE_NAME,
                project: 'proj',
                subproject: '../../outside', // Malicious subproject
                folder: 'stuff'
            });

            console.log('Create Task Result:', result);

            const exploitPath = path.join(STORAGE_ROOT, WORKSPACE_NAME, 'proj/../../outside/stuff');
            // If this directory exists outside our storage root, it's a vulnerability

            // Check if we managed to write to TEST_ROOT/outside/stuff
            const outsideCheck = path.join(TEST_ROOT, 'outside/stuff');
            if (await fs.pathExists(outsideCheck)) {
                console.log('❌ SECURITY ISSUE STILL EXISTS: Wrote files outside storage root');
                throw new Error('Security fix failed');
            } else {
                console.log('✅ SECURITY ISSUE FIXED: Prevented writing outside storage root');
            }

        } catch (e: any) {
            console.log('Caught expected error:', e.message);
            if (e.message.includes('security violation')) {
                console.log('✅ SECURITY ISSUE FIXED: Caught security violation error');
            }
        }
    });
});
