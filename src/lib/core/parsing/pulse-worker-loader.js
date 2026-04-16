import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

/**
 * Conducks — Pulse Worker ESM Loader 🛡️
 * 
 * Bootstraps the tsx loader for worker threads to ensure .js -> .ts 
 * resolution works reliably in development mode.
 */

try {
  const require = createRequire(import.meta.url);
  const tsxLoader = require.resolve('tsx');
  register(tsxLoader, import.meta.url);
} catch (e) {
  // Fallback
}

// Load the actual worker logic
import('./pulse-worker.ts');
