const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const { saveConfig } = require('./configService');
const { startTCPServer } = require('./tcpServer');
const { startRetryWorker } = require('./retryWorker');

let mainWindow;

// Control de instancia única
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Si alguien intenta abrir otra instancia, enfocamos la ventana principal
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.whenReady().then(() => {
        createWindow();

        // Esperar a que la ventana esté lista antes de iniciar servicios
        mainWindow.webContents.on('did-finish-load', () => {
            console.log('✅ Ventana cargada, iniciando servicios...');
            sendLog('Sistema iniciado correctamente', 'success');
            startTCPServer(sendStatus, sendLog);
            startRetryWorker(sendStatus, sendLog);
            sendLog('Servicios TCP y Retry Worker activos', 'info');

            // Verificaciones del SaaS
            setInterval(async () => {
                const { checkSaasStatus } = require('./apiService');
                const status = await checkSaasStatus();
                sendStatus('saas-status', status);
            }, 30000);

            setTimeout(async () => {
                const { checkSaasStatus } = require('./apiService');
                const status = await checkSaasStatus();
                sendStatus('saas-status', status);
            }, 2000);
        });
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        icon: path.join(__dirname, 'images', 'hemoscreen-analyser.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    mainWindow.loadFile('index.html');
}

function sendStatus(channel, data) {
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send(channel, data);
    }
}

function sendLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('es-ES', { hour12: false });
    sendStatus('log-message', { message, type, timestamp });
    console.log(`[${type.toUpperCase()}] ${message}`);
}

// Handlers IPC
ipcMain.on('save-config', (event, config) => {
    saveConfig(config);
    sendStatus('config-saved', true);
});

ipcMain.handle('get-config', async () => {
    const { getConfig } = require('./configService');
    return getConfig();
});

ipcMain.handle('get-queue-count', async () => {
    const queueService = require('./queueService');
    return await queueService.countPending();
});

ipcMain.handle('check-saas-status', async () => {
    const { checkSaasStatus } = require('./apiService');
    return await checkSaasStatus();
});

ipcMain.handle('retry-queue-now', async () => {
    const { processQueue } = require('./retryWorker');
    sendLog('Procesando cola manualmente...', 'info');
    await processQueue();
    sendLog('Procesamiento de cola completado', 'success');
    return { success: true };
});

ipcMain.handle('get-full-queue', async () => {
    const queueService = require('./queueService');
    return await queueService.getAllPending();
});

ipcMain.handle('update-patient-id', async (event, { id, newPatientId }) => {
    const queueService = require('./queueService');
    try {
        await queueService.updatePatientId(id, newPatientId);
        sendLog(`ID corregido para registro ${id}: ${newPatientId}`, 'success');
        return { success: true };
    } catch (err) {
        sendLog(`Falla al corregir ID: ${err.message}`, 'error');
        return { success: false, error: err.message };
    }
});

ipcMain.handle('get-local-ip', async () => {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
});
