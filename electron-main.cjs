/** @format */

const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

let mainWindow = null;
let dashboardServer = null;

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

	// Load the dashboard URL
	// We use a retry mechanism in case the server takes a moment to be ready
	const loadUrlWithRetry = (retries = 3) => {
		mainWindow.loadURL('http://localhost:2812').catch((err) => {
			if (retries > 0) {
				setTimeout(() => loadUrlWithRetry(retries - 1), 1000);
			} else {
				dialog.showErrorBox('Connection Failed', `Failed to load dashboard: ${err.message}`);
			}
		});
	};

	// Open DevTools for debugging
	mainWindow.webContents.openDevTools();

	loadUrlWithRetry();

	mainWindow.on('closed', () => {
		mainWindow = null;
	});
}

async function startDashboardServer() {
	try {
		// Set default storage root for packaged app if not set
		if (!process.env.CONDUCKS_STORAGE_ROOT) {
			process.env.CONDUCKS_STORAGE_ROOT = path.join(app.getPath('home'), '.conducks', 'storage');
		}

		const serverPath = path.join(__dirname, 'build/dashboard/server.js');
		// Convert to file URL for dynamic import support in all environments
		const serverUrl = pathToFileURL(serverPath).href;

		console.log(`Attempting to import server from: ${serverUrl}`);

		// Dynamic import of the ESM build
		const serverModule = await import(serverUrl);
		dashboardServer = serverModule.startServer(2812);
		console.log('Dashboard server started from Electron main process');
		return true;
	} catch (error) {
		console.error('Failed to start dashboard server:', error);
		dialog.showErrorBox(
			'Server Startup Error',
			`Failed to start local server.\nPath: ${path.join(__dirname, 'build/dashboard/server.js')}\nError: ${error.message}\nStack: ${error.stack}`
		);
		return false;
	}
}

function stopDashboardServer() {
	if (dashboardServer) {
		dashboardServer.close();
		dashboardServer = null;
	}
}

app.on('ready', async () => {
	const started = await startDashboardServer();
	if (started) {
		createWindow();
	} else {
		app.quit();
	}
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
