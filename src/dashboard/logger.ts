import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths for logs - use storage root if available, otherwise fallback to relative
const getLogRoot = () => {
    if (process.env.CONDUCKS_STORAGE_ROOT) {
        return process.env.CONDUCKS_STORAGE_ROOT;
    }
    return join(__dirname, '../../');
};

const LOG_ROOT = getLogRoot();
const PROJECT_LOG_PATH = join(LOG_ROOT, 'project.log');
const CALLS_LOG_PATH = join(LOG_ROOT, 'calls.log');

/**
 * Enhanced logging for comprehensive MCP debugging
 */
class MCPLogger {
    private projectLogPath: string;

    constructor() {
        // Ensure log directory exists
        const logDir = dirname(PROJECT_LOG_PATH);
        if (!existsSync(logDir)) {
            mkdirSync(logDir, { recursive: true });
        }

        this.projectLogPath = resolve(PROJECT_LOG_PATH);

        // Initialize log file with session header
        this.logEntry('MCP_SESSION_START', {
            timestamp: new Date().toISOString(),
            message: 'CONDUCKS MCP Server session started',
            version: '2.0-enhanced-logging',
            log_file: this.projectLogPath
        });
    }

    /**
     * Log detailed tool execution with full context
     */
    public logToolExecution(
        toolName: string,
        args: any,
        result: any,
        context?: {
            path_resolutions?: any;
            filesystem_ops?: any;
            validation_results?: any;
            internal_state?: any;
            duration_ms?: number;
        }
    ) {
        this.logEntry('TOOL_EXECUTION', {
            tool: toolName,
            args: this.sanitizeArgs(args),
            result: result,
            context: context || {},
            duration_ms: context?.duration_ms || null
        });
    }

    /**
     * Log path resolution operations
     */
    public logPathResolution(operation: string, input: string, resolved: string, context?: any) {
        this.logEntry('PATH_RESOLUTION', {
            operation,
            input_path: input,
            resolved_path: resolved,
            context: context || {}
        });
    }

    /**
     * Log filesystem operations
     */
    public logFilesystemOp(operation: string, paths: string[] | string, success: boolean, details?: any) {
        this.logEntry('FILESYSTEM_OPERATION', {
            operation,
            paths: Array.isArray(paths) ? paths : [paths],
            success,
            details: details || {}
        });
    }

    /**
     * Log parameter validation
     */
    public logValidation(name: string, value: any, valid: boolean, details?: any) {
        this.logEntry('PARAMETER_VALIDATION', {
            parameter: name,
            value: this.sanitizeArgs(value),
            valid,
            reason: valid ? 'passed' : (details?.error || 'unknown'),
            details: details || {}
        });
    }

    /**
     * Log project structure detection
     */
    public logStructureDetection(
        tool: string,
        target: string,
        detected: { subprojects: string[], rootHasGit: boolean, gitRoot?: string }
    ) {
        this.logEntry('PROJECT_STRUCTURE', {
            tool,
            target_path: target,
            detected_structure: detected
        });
    }

    /**
     * Log general operations
     */
    public logOperation(operation: string, details: any) {
        this.logEntry('OPERATION', {
            operation,
            ...details
        });
    }

    /**
     * Log errors with full context
     */
    public logError(tool: string, error: Error | string, context?: any) {
        this.logEntry('ERROR', {
            tool,
            error: error instanceof Error ? error.message : error,
            stack: error instanceof Error ? error.stack : null,
            context: context || {}
        });
    }

    /**
     * Sanitize sensitive arguments (future enhancement)
     */
    private sanitizeArgs(args: any): any {
        if (!args) return args;

        // For now, just return as-is. Could add sanitization later
        // e.g., remove API keys, passwords, etc.
        return args;
    }

    /**
     * Core logging method
     */
    private logEntry(type: string, data: any) {
        const entry = {
            timestamp: new Date().toISOString(),
            type,
            ...data
        };

        try {
            appendFileSync(this.projectLogPath, JSON.stringify(entry) + '\n');
        } catch (e) {
            // Fail silently in production - don't break the MCP flow
            console.error('❌ Failed to write to project.log:', e);
        }
    }
}

// Global logger instance
export const mcpLogger = new MCPLogger();

/**
 * Backward compatible logger for dashboard calls
 */
export function logToolCall(name: string, args: any, result: any) {
    // Keep existing dashboard log
    const entry = {
        timestamp: new Date().toISOString(),
        tool: name,
        args,
        result: result?.success ?? false,
        message: result?.message ?? null,
    };
    try {
        appendFileSync(CALLS_LOG_PATH, JSON.stringify(entry) + '\n');
    } catch (e) {
        // Fail silently
    }

    // Also log to enhanced project log
    mcpLogger.logToolExecution(name, args, result);
}
