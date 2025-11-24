import { appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOG_PATH = join(__dirname, '../../dashboard/calls.log');

/**
 * Simple logger that appends a JSON line for each tool invocation.
 * It is deliberately lightweight – no external DB – to keep the MCP
 * self‑contained. The dashboard reads this file to display the call
 * history.
 */
export function logToolCall(name: string, args: any, result: any) {
    const entry = {
        timestamp: new Date().toISOString(),
        tool: name,
        args,
        result: result?.success ?? false,
        message: result?.message ?? null,
    };
    try {
        appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
    } catch (e) {
        // Fail silently – logging should never break the main flow.
    }
}
