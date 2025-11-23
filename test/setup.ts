/**
 * Test setup - MUST run before any other imports
 * Sets environment variables for isolated test workspace
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_ROOT = path.join(__dirname, '../test-workspace');
const STORAGE_ROOT = path.join(TEST_ROOT, 'storage');

// Set before any module imports config.ts
process.env.CONDUCKS_STORAGE_DIR = STORAGE_ROOT;

console.log(`\n╔═══════════════════════════════════════════════════════╗`);
console.log(`║       CONDUCKS Workflow Integration Tests            ║`);
console.log(`╚═══════════════════════════════════════════════════════╝\n`);
console.log(`Test Storage: ${STORAGE_ROOT}`);
