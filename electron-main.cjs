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
		icon: path.join(__dirname, 'src/dashboard/public/logo.png'),
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

let dashboardProcess = null;

function startDashboardServer() {
	// Start Express dashboard server in background
	dashboardProcess = spawn(
		'node',
		[path.join(__dirname, 'build/dashboard/server.js')],
		{
			stdio: 'inherit',
			detached: false,
		}
	);
}

function stopDashboardServer() {
	if (dashboardProcess) {
		dashboardProcess.kill();
		dashboardProcess = null;
	}
}

app.on('ready', () => {
	startDashboardServer();
	setTimeout(createWindow, 2000); // Wait for dashboard server to start
});

app.on('window-all-closed', () => {
	stopDashboardServer();
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
	stopDashboardServer();
});
