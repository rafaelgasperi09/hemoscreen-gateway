// Elementos del DOM
const queueCountElement = document.getElementById('queueCount');
const deviceStatusElement = document.getElementById('deviceStatus');
const configBody = document.getElementById('configBody');
const toggleConfigBtn = document.getElementById('toggleConfig');
const configForm = document.getElementById('configForm');
const saasStatusElement = document.getElementById('saasStatus');
const apiEndpoint = document.getElementById('apiEndpoint');
const tcpPortDisplay = document.getElementById('tcpPortDisplay');
const retryNowBtn = document.getElementById('retryNowBtn');
const logContainer = document.getElementById('logContainer');
const clearLogsBtn = document.getElementById('clearLogsBtn');
const refreshQueueBtn = document.getElementById('refreshQueueBtn');
const queueListContainer = document.getElementById('queueListContainer');
const resetSyncBtn = document.getElementById('resetSyncBtn');

// Elementos de la Guía de Instalación
const toggleSetupGuideBtn = document.getElementById('toggleSetupGuide');
const setupGuideBody = document.getElementById('setupGuideBody');
const detectLocalIpBtn = document.getElementById('detectLocalIpBtn');
const localIpDisplay = document.getElementById('localIpDisplay');
const hostIpHint = document.getElementById('hostIpHint');
const setupStatusBadge = document.getElementById('setupStatusBadge');

console.log('🔧 Inicializando interfaz...');

// Array para almacenar logs (máximo 100)
let logs = [];

// Toggle para mostrar/ocultar configuración
let configVisible = false;
toggleConfigBtn.addEventListener('click', () => {
    configVisible = !configVisible;
    configBody.style.display = configVisible ? 'block' : 'none';
    toggleConfigBtn.textContent = configVisible ? 'Ocultar' : 'Mostrar';
});

// Toggle para Guía de Instalación
let setupVisible = false;
if (toggleSetupGuideBtn) {
    toggleSetupGuideBtn.addEventListener('click', () => {
        setupVisible = !setupVisible;
        setupGuideBody.style.display = setupVisible ? 'block' : 'none';
        toggleSetupGuideBtn.textContent = setupVisible ? 'Ocultar Guía' : 'Mostrar Guía';
    });
}

// Detectar IP Local
if (detectLocalIpBtn) {
    detectLocalIpBtn.addEventListener('click', async () => {
        detectLocalIpBtn.disabled = true;
        detectLocalIpBtn.textContent = 'Buscando...';
        try {
            const ip = await window.electronAPI.getLocalIp();
            localIpDisplay.textContent = `IP: ${ip}`;
            if (hostIpHint) hostIpHint.textContent = ip;
            showNotification('✅ IP local detectada: ' + ip);
        } catch (err) {
            showNotification('❌ Error detectando IP', 'error');
        } finally {
            detectLocalIpBtn.disabled = false;
            detectLocalIpBtn.textContent = 'Detectar IP de esta PC';
        }
    });
}

// Cargar configuración actual
loadCurrentConfig();
refreshQueueList();

// Listener para actualizar cola manualmente
if (refreshQueueBtn) {
    refreshQueueBtn.addEventListener('click', () => {
        refreshQueueList();
    });
}

// Listener para estado del dispositivo
window.electronAPI.onDeviceStatus((status) => {
    console.log('📥 Evento recibido - device-status:', status);

    if (status === 'connected') {
        deviceStatusElement.className = 'status-badge connected';
        deviceStatusElement.innerHTML = '<span class="status-dot"></span> Conectado';

        // Actualizar también el badge de la guía
        if (setupStatusBadge) {
            setupStatusBadge.className = 'status-badge connected';
            setupStatusBadge.innerHTML = '<span class="status-dot"></span> ¡HemoScreen Conectado!';
        }
    } else {
        deviceStatusElement.className = 'status-badge disconnected';
        deviceStatusElement.innerHTML = '<span class="status-dot"></span> Desconectado';

        if (setupStatusBadge) {
            setupStatusBadge.className = 'status-badge disconnected';
            setupStatusBadge.innerHTML = '<span class="status-dot"></span> Esperando equipo...';
        }
    }
});

// Listener para actualización de cola
window.electronAPI.onQueueUpdate(async () => {
    const count = await fetchQueueCount();
    queueCountElement.textContent = count;
});

// Listener para confirmación de guardado
window.electronAPI.onConfigSaved(() => {
    showNotification('✅ Configuración guardada correctamente');
    loadCurrentConfig();
});

// Listener para estado del SaaS
window.electronAPI.onSaasStatus((status) => {
    console.log('📥 Estado SaaS:', status);
    updateSaasStatus(status);
});

// Listener para mensajes de log
window.electronAPI.onLogMessage((logData) => {
    addLogEntry(logData.message, logData.type, logData.timestamp);
});

// Manejar envío del formulario
configForm.addEventListener('submit', (e) => {
    e.preventDefault();
    saveConfig();
});

// Botón para reintentar ahora
retryNowBtn.addEventListener('click', async () => {
    retryNowBtn.disabled = true;
    retryNowBtn.classList.add('processing');
    retryNowBtn.innerHTML = '<span>🔄</span> Procesando...';

    try {
        await window.electronAPI.retryQueueNow();
        showNotification('✅ Cola procesada correctamente');

        // Actualizar contador de cola
        const count = await fetchQueueCount();
        queueCountElement.textContent = count;
    } catch (err) {
        showNotification('❌ Error al procesar cola', 'error');
    } finally {
        retryNowBtn.disabled = false;
        retryNowBtn.classList.remove('processing');
        retryNowBtn.innerHTML = '<span>🔄</span> Reintentar Ahora';
    }
});

// Botón para reiniciar historial
if (resetSyncBtn) {
    resetSyncBtn.addEventListener('click', async () => {
        if (!confirm('¿Estás seguro de reiniciar el historial? El equipo médico volverá a enviar todos los resultados archivados desde cero.')) {
            return;
        }

        resetSyncBtn.disabled = true;
        try {
            const result = await window.electronAPI.clearHistory();
            if (result.success) {
                showNotification('✅ Historial local reiniciado');
                addLogEntry('Historial de sincronización reiniciado por el usuario', 'warning');

                // Actualizar UI
                const count = await fetchQueueCount();
                queueCountElement.textContent = count;
                refreshQueueList();
            } else {
                showNotification('❌ Error al reiniciar historial', 'error');
            }
        } catch (err) {
            showNotification('❌ Error de comunicación', 'error');
        } finally {
            resetSyncBtn.disabled = false;
        }
    });
}

// Botón para limpiar logs
clearLogsBtn.addEventListener('click', () => {
    logs = [];
    logContainer.innerHTML = '<div class="log-entry info"><span class="log-time">--:--:--</span><span class="log-message">Logs limpiados</span></div>';
});

// Función para guardar configuración
function saveConfig() {
    const config = {
        apiUrl: document.getElementById('apiUrl').value,
        apiToken: document.getElementById('apiToken').value,
        deviceSerial: document.getElementById('deviceSerial').value,
        tcpPort: parseInt(document.getElementById('tcpPort').value) || 5000
    };

    console.log('💾 Guardando configuración:', { ...config, apiToken: '***' });
    window.electronAPI.saveConfig(config);

    // Actualizar display del puerto TCP
    tcpPortDisplay.textContent = config.tcpPort;

    // Actualizar info de API
    updateApiEndpoint(config);

    // Verificar estado del SaaS inmediatamente
    setTimeout(async () => {
        const status = await window.electronAPI.checkSaasStatus();
        updateSaasStatus(status);
    }, 1000);
}

// Función para cargar configuración actual
async function loadCurrentConfig() {
    try {
        const config = await window.electronAPI.getConfig();

        document.getElementById('apiUrl').value = config.apiUrl || '';
        document.getElementById('apiToken').value = config.apiToken || '';
        document.getElementById('deviceSerial').value = config.deviceSerial || '';
        document.getElementById('tcpPort').value = config.tcpPort || 5000;

        tcpPortDisplay.textContent = config.tcpPort || 5000;
        updateApiEndpoint(config);
    } catch (err) {
        console.log('⚠️  Error cargando configuración:', err.message);
    }
}

// Actualizar estado del SaaS
function updateSaasStatus(status) {
    if (status.online) {
        saasStatusElement.className = 'status-badge connected';
        saasStatusElement.innerHTML = '<span class="status-dot"></span> Online';
    } else {
        saasStatusElement.className = 'status-badge disconnected';
        if (status.reason === 'not_configured') {
            saasStatusElement.innerHTML = '<span class="status-dot"></span> No configurado';
        } else {
            saasStatusElement.innerHTML = '<span class="status-dot"></span> Offline';
        }
    }
}

// Actualizar endpoint de la API
function updateApiEndpoint(config) {
    if (config.apiUrl) {
        // Mostrar solo el dominio de la API
        try {
            const url = new URL(config.apiUrl);
            apiEndpoint.textContent = `Endpoint: ${url.hostname}`;
        } catch {
            apiEndpoint.textContent = `Endpoint: ${config.apiUrl}`;
        }
    } else {
        apiEndpoint.textContent = '';
    }
}

// Función para obtener cantidad de mensajes en cola
async function fetchQueueCount() {
    try {
        const count = await window.electronAPI.getQueueCount();
        return count;
    } catch (err) {
        console.error('Error consultando cola:', err);
        return 0;
    }
}

// Agregar entrada al log visual
function addLogEntry(message, type = 'info', timestamp = null) {
    const time = timestamp || new Date().toLocaleTimeString('es-ES', { hour12: false });

    // Agregar al array de logs
    logs.push({ message, type, time });

    // Mantener solo los últimos 50 logs en pantalla para evitar bloqueos del UI
    if (logs.length > 50) {
        logs.shift();
        if (logContainer.firstElementChild) {
            logContainer.removeChild(logContainer.firstElementChild);
        }
    }

    // Crear elemento de log
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.innerHTML = `
        <span class="log-time">${time}</span>
        <span class="log-message">${message}</span>
    `;

    // Si el contenedor solo tiene el mensaje de inicio, limpiarlo
    if (logContainer.children.length === 1 && logContainer.textContent.includes('Sistema iniciado')) {
        logContainer.innerHTML = '';
    }

    // Agregar nuevo log
    logContainer.appendChild(logEntry);

    // Auto-scroll al último log
    logContainer.scrollTop = logContainer.scrollHeight;
}

// Mostrar notificaciones
function showNotification(message, type = 'success') {
    // Crear elemento de notificación
    const notification = document.createElement('div');
    notification.textContent = message;

    const bgColor = type === 'error'
        ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
        : 'linear-gradient(135deg, #10b981 0%, #059669 100%)';

    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${bgColor};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 1000;
        font-weight: 500;
        animation: slideIn 0.3s ease-out;
    `;

    document.body.appendChild(notification);

    // Eliminar después de 3 segundos
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Estilos para animaciones de notificación
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Actualizar contador de cola cada 5 segundos
setInterval(async () => {
    const count = await fetchQueueCount();
    queueCountElement.textContent = count;
}, 5000);

// Verificación inicial del contador de cola
(async () => {
    const count = await fetchQueueCount();
    queueCountElement.textContent = count;
})();

// Función para refrescar la lista de la cola
async function refreshQueueList() {
    try {
        const queue = await window.electronAPI.getFullQueue();
        if (queue.length === 0) {
            queueListContainer.innerHTML = '<p class="empty-msg">No hay resultados pendientes por corregir.</p>';
            return;
        }

        let html = `
            <table class="queue-table">
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th>ID Paciente/Orden</th>
                        <th>Estado/Error</th>
                        <th>Acción</th>
                    </tr>
                </thead>
                <tbody>
        `;

        queue.forEach(item => {
            const payload = JSON.parse(item.payload);
            const date = new Date(item.created_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

            html += `
                <tr class="queue-row" id="row-${item.id}">
                    <td>${date}</td>
                    <td class="patient-id-cell" id="id-display-${item.id}">${payload.patient_identifier}</td>
                    <td>
                        <span class="last-attempt">Intento: ${item.attempts}</span>
                        <span class="error-text" title="${item.last_error || ''}">${item.last_error || 'Pendiente'}</span>
                    </td>
                    <td id="action-cell-${item.id}">
                        <button class="btn-small btn-edit" onclick="startEdit(${item.id}, '${payload.patient_identifier}')">
                            Editar ID
                        </button>
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        queueListContainer.innerHTML = html;

    } catch (err) {
        console.error('Error al refrescar cola:', err);
    }
}

// Funciones globales para que onclick las encuentre
window.startEdit = function (id, currentId) {
    const displayCell = document.getElementById(`id-display-${id}`);
    const actionCell = document.getElementById(`action-cell-${id}`);

    displayCell.innerHTML = `<input type="text" id="input-${id}" class="id-input-small" value="${currentId}">`;
    actionCell.innerHTML = `
        <div class="edit-actions">
            <button class="btn-small btn-save" onclick="saveEdit(${id})">💾</button>
            <button class="btn-small btn-cancel" onclick="refreshQueueList()">❌</button>
        </div>
    `;
};

window.saveEdit = async function (id) {
    const input = document.getElementById(`input-${id}`);
    const newPatientId = input.value.trim();

    if (!newPatientId) {
        showNotification('El ID no puede estar vacío', 'error');
        return;
    }

    try {
        const result = await window.electronAPI.updatePatientId(id, newPatientId);
        if (result.success) {
            showNotification('✅ ID actualizado correctamente');
            refreshQueueList();

            // Actualizar contador general
            const count = await fetchQueueCount();
            queueCountElement.textContent = count;
        } else {
            showNotification('❌ Error: ' + result.error, 'error');
        }
    } catch (err) {
        showNotification('❌ Error al guardar', 'error');
    }
};

console.log('✅ Interfaz lista');
