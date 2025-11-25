import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { marked } from 'marked';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Storage root (same logic as other tools - absolute relative to conducks root)
const getStorageRoot = () => process.env.CONDUCKS_STORAGE_ROOT || resolve(__dirname, '..', '..', 'storage');

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
    const logPath = join(__dirname, 'calls.log');
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

// API: list jobs for a workspace
app.get('/api/jobs/:workspace', (req: Request, res: Response) => {
    const { workspace } = req.params;
    const jobs = [];

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

    res.json(jobs);
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

const PORT = process.env.CONDUCKS_DASHBOARD_PORT || 2812;
app.listen(PORT, () => {
    console.log(`🔧 CONDUCKS dashboard listening on http://localhost:${PORT}`);
});
