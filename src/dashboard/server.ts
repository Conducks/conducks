import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import fsExtra from 'fs-extra';
const { copySync, writeJsonSync, readJsonSync, ensureDirSync, removeSync } = fsExtra;
import { marked } from 'marked';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Storage root (same logic as other tools - absolute relative to conducks root)
const getStorageRoot = () => {
    const root = process.env.CONDUCKS_STORAGE_ROOT || resolve(__dirname, '..', '..', 'storage');
    console.log(`📂 Storage Root: ${root}`);

    // Ensure storage directory exists
    try {
        ensureDirSync(root);
    } catch (e) {
        console.error(`Failed to create storage root at ${root}:`, e);
    }

    return root;
};

const app = express();
app.use(cors());
app.use(express.json());

// Serve static UI files
// Serve dashboard UI from public/
app.use(express.static(join(__dirname, 'public')));

// Serve index.html for all non-API routes (SPA fallback)
app.get(/^\/(?!api).*/, (req: Request, res: Response) => {
    res.sendFile(join(__dirname, 'public', 'index.html'));
});

// API: return tool call log (line‑delimited JSON)
app.get('/api/calls', (req: Request, res: Response) => {
    const root = process.env.CONDUCKS_STORAGE_ROOT || join(__dirname, '..', '..');
    const logPath = join(root, 'calls.log');
    try {
        const data = readFileSync(logPath, 'utf-8');
        const lines = data.trim().split('\n').filter(Boolean).map((l: string) => JSON.parse(l));
        res.json(lines);
    } catch (e) {
        res.status(404).json({ error: 'Log not found' });
    }
});

// Helper: build a simple file‑tree for the storage root
interface FileNode {
    name: string;
    type: 'file' | 'directory';
    children?: FileNode[];
}

function buildTree(dir: string): FileNode[] {
    const entries = readdirSync(dir, { withFileTypes: true });
    return entries.map((entry: any) => {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            return { name: entry.name, type: 'directory', children: buildTree(fullPath) };
        } else {
            return { name: entry.name, type: 'file' };
        }
    });
}

app.get('/api/tree', (req: Request, res: Response) => {
    try {
        const root = getStorageRoot();
        const tree = buildTree(root);
        res.json({ root, tree });
    } catch (e) {
        res.status(500).json({ error: 'Failed to read storage' });
    }
});

// API: return markdown content of a file (path is relative to storage root)
app.get('/api/file', (req: Request, res: Response) => {
    const relPath = (req.query.path as string) || '';
    const absPath = join(getStorageRoot(), relPath);
    try {
        const content = readFileSync(absPath, 'utf-8');
        // Render to HTML using marked for clean preview
        const html = marked(content);
        res.json({ path: relPath, html, raw: content });
    } catch (e) {
        res.status(404).json({ error: 'File not found' });
    }
});

// API: list all workspaces
app.get('/api/workspaces', (req: Request, res: Response) => {
    try {
        const root = getStorageRoot();
        const entries = readdirSync(root, { withFileTypes: true });
        const workspaces = entries
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name);
        res.json(workspaces);
    } catch (e) {
        res.status(500).json({ error: 'Failed to list workspaces' });
    }
});

// API: list jobs for a workspace with architecture mode detection
app.get('/api/jobs/:workspace', (req: Request, res: Response) => {
    const { workspace } = req.params;
    const jobs = [];
    let projectMode = 'unknown';

    // Detect architecture mode based on storage structure
    try {
        const workspacePath = join(getStorageRoot(), workspace);
        if (existsSync(join(workspacePath, 'jobs'))) {
            // Has jobs folder - this is a properly initialized workspace
            const hasDirectTasks = existsSync(join(workspacePath, 'to-do'));
            const hasSubprojects = readdirSync(workspacePath)
                .filter(item => {
                    const itemPath = join(workspacePath, item);
                    return existsSync(itemPath) &&
                        readdirSync(itemPath).some(sub => sub === 'to-do' && existsSync(join(itemPath, sub)));
                })
                .length > 0;

            if (hasDirectTasks && !hasSubprojects) {
                projectMode = 'single-project';
            } else if (!hasDirectTasks && hasSubprojects) {
                projectMode = 'multi-project';
            } else {
                projectMode = 'mixed';
            }
        }
    } catch (e) {
        // Continue with unknown mode
    }

    // Load from to-do folder
    try {
        const todoPath = join(getStorageRoot(), workspace, 'jobs', 'to-do');
        if (existsSync(todoPath)) {
            const todoFiles = readdirSync(todoPath);
            for (const file of todoFiles) {
                if (file.endsWith('.toon')) {
                    try {
                        const content = readFileSync(join(todoPath, file), 'utf-8');
                        const job = JSON.parse(content);
                        job.location = 'to-do';
                        job.project_mode = projectMode;
                        jobs.push(job);
                    } catch (e) {
                        // Skip invalid JSON
                    }
                }
            }
        }
    } catch (e) {
        // Silently ignore errors for this folder
    }

    // Load from done-to-do folder
    try {
        const donePath = join(getStorageRoot(), workspace, 'jobs', 'done-to-do');
        if (existsSync(donePath)) {
            const doneFiles = readdirSync(donePath);
            for (const file of doneFiles) {
                if (file.endsWith('.toon')) {
                    try {
                        const content = readFileSync(join(donePath, file), 'utf-8');
                        const job = JSON.parse(content);
                        job.location = 'done-to-do';
                        job.project_mode = projectMode;
                        jobs.push(job);
                    } catch (e) {
                        // Skip invalid JSON
                    }
                }
            }
        }
    } catch (e) {
        // Silently ignore errors for this folder
    }

    res.json({ jobs, project_mode: projectMode });
});

// API: get job details
app.get('/api/job/:workspace/:id', (req: Request, res: Response) => {
    const { workspace, id } = req.params;
    try {
        const root = getStorageRoot();
        const jobsPath = join(root, workspace, 'jobs');

        let jobData = null;
        let found = false;

        // Check to-do folder
        const todoPath = join(jobsPath, 'to-do');
        if (existsSync(todoPath)) {
            const todoFiles = readdirSync(todoPath);
            for (const file of todoFiles) {
                if (file.endsWith('.toon') && file.startsWith(`${id}_`)) {
                    const content = readFileSync(join(todoPath, file), 'utf-8');
                    jobData = JSON.parse(content);
                    jobData.location = 'to-do';
                    found = true;
                    break;
                }
            }
        }

        // Check done-to-do folder if not found
        if (!found) {
            const donePath = join(jobsPath, 'done-to-do');
            if (existsSync(donePath)) {
                const doneFiles = readdirSync(donePath);
                for (const file of doneFiles) {
                    if (file.endsWith('.toon') && file.startsWith(`${id}_`)) {
                        const content = readFileSync(join(donePath, file), 'utf-8');
                        jobData = JSON.parse(content);
                        jobData.location = 'done-to-do';
                        found = true;
                        break;
                    }
                }
            }
        }

        if (found) {
            res.json(jobData);
        } else {
            res.status(404).json({ error: 'Job not found' });
        }
    } catch (e) {
        res.status(500).json({ error: 'Failed to load job' });
    }
});

// API: get project structure (docs, specs, etc.)
app.get('/api/project-structure/:workspace', (req: Request, res: Response) => {
    const { workspace } = req.params;
    try {
        const root = getStorageRoot();
        const workspacePath = join(root, workspace);

        function buildProjectTree(dir: string, relativePath: string = ''): any {
            const entries = readdirSync(join(workspacePath, relativePath), { withFileTypes: true });
            const tree = [];

            for (const entry of entries) {
                const fullPath = join(workspacePath, relativePath, entry.name);
                if (entry.isDirectory()) {
                    tree.push({
                        name: entry.name,
                        type: 'directory',
                        path: join(relativePath, entry.name),
                        children: buildProjectTree(dir, join(relativePath, entry.name))
                    });
                } else {
                    tree.push({
                        name: entry.name,
                        type: 'file',
                        path: join(relativePath, entry.name),
                        ext: entry.name.split('.').pop() || ''
                    });
                }
            }

            return tree;
        }

        const structure = buildProjectTree(workspacePath);
        res.json({ workspace, structure });
    } catch (e) {
        res.status(500).json({ error: 'Failed to load project structure' });
    }
});

// API: Get config preview
app.get('/api/config-preview', (req: Request, res: Response) => {
    try {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        const installDir = join(homeDir, '.conducks');
        const storageRoot = getStorageRoot();

        const config = {
            mcpServers: {
                conducks: {
                    command: "node",
                    args: [join(installDir, "index.js")],
                    env: {
                        CONDUCKS_STORAGE_ROOT: storageRoot
                    }
                }
            }
        };
        res.json(config);
    } catch (e) {
        res.status(500).json({ error: 'Failed to generate config preview' });
    }
});

// API: Install MCP server
app.post('/api/setup', (req: Request, res: Response) => {
    try {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        const installDir = join(homeDir, '.conducks');
        const claudeConfigPath = join(homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');

        // 1. Create install directory
        // 1. Create/Clean install directory
        ensureDirSync(installDir);
        fsExtra.emptyDirSync(installDir);

        // 2. Copy build files with bundled node_modules
        // Always use the build directory which contains bundled dependencies
        let buildDir = resolve(__dirname, '..', '..', 'build');

        // Fix for Electron packaged app: fs-extra copySync fails with ENOTDIR when copying from ASAR.
        // We must use the unpacked directory.
        if (buildDir.includes('app.asar')) {
            buildDir = buildDir.replace('app.asar', 'app.asar.unpacked');
        }

        // node_modules is a sibling of build in the unpacked app (e.g. app.asar.unpacked/node_modules)
        const nodeModulesSource = resolve(buildDir, '..', 'node_modules');

        console.log(`Copying from ${buildDir} to ${installDir}`);
        copySync(buildDir, installDir, { overwrite: true, dereference: true });

        // Explicitly copy node_modules if found (primary install method for packaged app)
        if (existsSync(nodeModulesSource)) {
            console.log(`Copying bundled node_modules from ${nodeModulesSource}...`);
            copySync(nodeModulesSource, join(installDir, 'node_modules'), { overwrite: true, dereference: true });
        }

        try {
            console.log('Running npm install in install directory (fallback)...');
            execSync('npm install --production --ignore-scripts', { cwd: installDir, stdio: 'inherit' });
        } catch (e) {
            console.warn('npm install failed, but bundled modules might be sufficient:', e);
        }
        // 3. Update Claude config
        let claudeConfig: any = {};
        if (existsSync(claudeConfigPath)) {
            try {
                claudeConfig = readJsonSync(claudeConfigPath);
            } catch (e) {
                // Ignore invalid config, start fresh
            }
        }

        claudeConfig.mcpServers = claudeConfig.mcpServers || {};
        claudeConfig.mcpServers.conducks = {
            command: "node",
            args: [join(installDir, "index.js")],
            env: {
                CONDUCKS_STORAGE_ROOT: getStorageRoot()
            }
        };

        ensureDirSync(dirname(claudeConfigPath));
        writeJsonSync(claudeConfigPath, claudeConfig, { spaces: 2 });

        res.json({ success: true, path: installDir });
    } catch (e: any) {
        console.error('Setup failed:', e);
        res.status(500).json({ error: e.message });
    }
});

// API: Uninstall MCP server
app.post('/api/uninstall', (req: Request, res: Response) => {
    try {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        const installDir = join(homeDir, '.conducks');
        const claudeConfigPath = join(homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');

        // 1. Remove install directory
        if (existsSync(installDir)) {
            removeSync(installDir);
        }

        // 2. Remove from Claude config
        if (existsSync(claudeConfigPath)) {
            try {
                const claudeConfig = readJsonSync(claudeConfigPath);
                if (claudeConfig.mcpServers && claudeConfig.mcpServers.conducks) {
                    delete claudeConfig.mcpServers.conducks;
                    writeJsonSync(claudeConfigPath, claudeConfig, { spaces: 2 });
                }
            } catch (e) {
                // Ignore config errors
            }
        }

        res.json({ success: true });
    } catch (e: any) {
        console.error('Uninstall failed:', e);
        res.status(500).json({ error: e.message });
    }
});

const PORT = process.env.CONDUCKS_DASHBOARD_PORT || 2812;

export function startServer(port: number | string = PORT) {
    return app.listen(port, () => {
        console.log(`🔧 CONDUCKS dashboard listening on http://localhost:${port}`);
    });
}

// Auto-start if run directly (ESM check)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    startServer();
}
