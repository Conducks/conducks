/** @format */

// src/dashboard/server.js
import express from 'express';
import cors from 'cors';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { marked } from 'marked';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve storage root (same logic as other tools)
const getStorageRoot = () =>
	process.env.CONDUCKS_STORAGE_ROOT || resolve(process.cwd(), 'storage');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static UI files (public folder sits next to this file)
app.use('/', express.static(join(__dirname, 'public')));

// API: return tool call log (line‑delimited JSON)
app.get('/api/calls', (req, res) => {
	const logPath = join(__dirname, 'calls.log');
	try {
		const data = readFileSync(logPath, 'utf-8');
		const lines = data
			.trim()
			.split('\n')
			.filter(Boolean)
			.map((l) => JSON.parse(l));
		res.json(lines);
	} catch (e) {
		res.status(404).json({ error: 'Log not found' });
	}
});

// Helper: build a simple file‑tree for the storage root
function buildTree(dir) {
	const entries = readdirSync(dir, { withFileTypes: true });
	return entries.map((entry) => {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			return {
				name: entry.name,
				type: 'directory',
				children: buildTree(fullPath),
			};
		} else {
			return { name: entry.name, type: 'file' };
		}
	});
}

app.get('/api/tree', (req, res) => {
	try {
		const root = getStorageRoot();
		const tree = buildTree(root);
		res.json({ root, tree });
	} catch (e) {
		res.status(500).json({ error: 'Failed to read storage' });
	}
});

// API: return markdown content of a file (path is relative to storage root)
app.get('/api/file', (req, res) => {
	const relPath = (req.query.path || '').toString();
	const absPath = join(getStorageRoot(), relPath);
	try {
		const content = readFileSync(absPath, 'utf-8');
		const html = marked(content);
		res.json({ path: relPath, html, raw: content });
	} catch (e) {
		res.status(404).json({ error: 'File not found' });
	}
});

const PORT = process.env.CONDUCKS_DASHBOARD_PORT || 2812;
app.listen(PORT, () => {
	console.log(`🔧 CONDUCKS dashboard listening on http://localhost:${PORT}`);
});
