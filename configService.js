const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// En producción, usamos la carpeta de datos del usuario (AppData)
// En desarrollo, podemos seguir usando la carpeta local si app no está lista, 
// o forzar AppData para consistencia.
const userDataPath = app
    ? app.getPath('userData')
    : (process.env.APPDATA
        ? path.join(process.env.APPDATA, 'hemoscreen-gateway')
        : __dirname);

const configPath = path.join(userDataPath, 'config.json');
const dbPath = path.join(userDataPath, 'gateway.db');
const logPath = path.join(userDataPath, 'gateway.log');

// Asegurar que el directorio existe si no estamos en Electron
if (!app && userDataPath !== __dirname) {
    if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
    }
}

function getConfig() {
    if (!fs.existsSync(configPath)) {
        return {
            apiUrl: '',
            apiToken: '',
            tcpPort: 5000,
            deviceSerial: '',
            endpointType: 'hemoscreen'
        };
    }

    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        // Asegurar que exista el endpointType por defecto si es una config vieja
        if (!config.endpointType) config.endpointType = 'hemoscreen';
        return config;
    } catch (err) {
        console.error("Error leyendo config:", err);
        return { apiUrl: '', apiToken: '', tcpPort: 5000, deviceSerial: '', endpointType: 'hemoscreen' };
    }
}

function saveConfig(config) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function writeToPhysicalLog(message, type = 'INFO') {
    try {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [${type}] ${message}\n`;
        fs.appendFileSync(logPath, logEntry);
    } catch (err) {
        console.error("No se pudo escribir en el log físico:", err);
    }
}

module.exports = {
    getConfig,
    saveConfig,
    writeToPhysicalLog,
    configPath,
    dbPath,
    logPath
};
