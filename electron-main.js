/** @format */

const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mcpProcess = null;
let mainWindow = null;

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1200,
		height: 800,
		icon: path.join(__dirname, 'src/dashboard/public/logo.png'), // App icon for window and packaging
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
		title: 'CONDUCKS Dashboard',
	});
	mainWindow.loadURL('http://localhost:2812');
	mainWindow.on('closed', () => {
		mainWindow = null;
	});
}

function startMCPServer() {
	// Start MCP server in background
	mcpProcess = spawn('node', [path.join(__dirname, 'build/index.js')], {
		stdio: 'ignore',
		detached: true,
	});
}

function stopMCPServer() {
	if (mcpProcess) {
		mcpProcess.kill();
		mcpProcess = null;
	}
}

app.on('ready', () => {
	startMCPServer();
	setTimeout(createWindow, 2000); // Wait for dashboard server to start
});

app.on('window-all-closed', () => {
	stopMCPServer();
	if (process.platform !== 'darwin') {
		app.quit();
	}
});

app.on('activate', () => {
	if (mainWindow === null) {
		createWindow();
	}
});

app.on('quit', () => {
	stopMCPServer();
});
