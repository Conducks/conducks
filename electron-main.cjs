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
		icon: path.join(__dirname, 'build/dashboard/public/logo.png'),
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

let dashboardServer = null;

async function startDashboardServer() {
	try {
		// Dynamic import of the ESM build
		const serverModule = await import(path.join(__dirname, 'build/dashboard/server.js'));
		dashboardServer = serverModule.startServer(2812);
		console.log('Dashboard server started from Electron main process');
	} catch (error) {
		console.error('Failed to start dashboard server:', error);
	}
}

function stopDashboardServer() {
	if (dashboardServer) {
		dashboardServer.close();
		dashboardServer = null;
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
