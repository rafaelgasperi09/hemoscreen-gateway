const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    saveConfig: (config) => ipcRenderer.send('save-config', config),
    getConfig: () => ipcRenderer.invoke('get-config'),
    getQueueCount: () => ipcRenderer.invoke('get-queue-count'),
    checkSaasStatus: () => ipcRenderer.invoke('check-saas-status'),
    retryQueueNow: () => ipcRenderer.invoke('retry-queue-now'),
    getFullQueue: () => ipcRenderer.invoke('get-full-queue'),
    updatePatientId: (id, newPatientId) => ipcRenderer.invoke('update-patient-id', { id, newPatientId }),
    getLocalIp: () => ipcRenderer.invoke('get-local-ip'),
    onDeviceStatus: (callback) => ipcRenderer.on('device-status', (_, data) => callback(data)),
    onQueueUpdate: (callback) => ipcRenderer.on('queue-update', () => callback()),
    onConfigSaved: (callback) => ipcRenderer.on('config-saved', () => callback()),
    onSaasStatus: (callback) => ipcRenderer.on('saas-status', (_, data) => callback(data)),
    onLogMessage: (callback) => ipcRenderer.on('log-message', (_, data) => callback(data))
});
