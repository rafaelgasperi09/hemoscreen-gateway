const axios = require('axios');
const queueService = require('./queueService');
const { getConfig } = require('./configService');

let sendStatus = () => { };
let sendLog = () => { };

async function processQueue() {

    const config = getConfig();
    const items = await queueService.getPending();

    if (items.length === 0) return;

    sendLog(`Procesando ${items.length} mensaje(s) en cola`, 'info');

    const MAX_ATTEMPTS = 10;

    for (const item of items) {
        if (item.attempts >= MAX_ATTEMPTS) {
            console.log(`🛑 Límite de reintentos alcanzado para ID ${item.id}. Marcando como fallido.`);
            await queueService.markAsFailed(item.id, `STOPPED: Máximo de ${MAX_ATTEMPTS} reintentos alcanzado.`, true);
            continue;
        }

        try {

            const payload = JSON.parse(item.payload);
            const url = `${config.apiUrl}/api/v1/lab/hemoscreen`;

            console.log(`🔄 Reintentando ID ${item.id} (${item.attempts}/${MAX_ATTEMPTS}) a ${url}`);
            sendLog(`Reintentando envío a ${url}`, 'info');

            const response = await axios.post(url, payload, {
                headers: {
                    Authorization: `Bearer ${config.apiToken}`,
                    "Content-Type": "application/json"
                },
                timeout: 10000
            });

            console.log(`✔ Reintento exitoso ID ${item.id}`, response.status);
            sendLog(`Reintento exitoso para mensaje ID ${item.id}`, 'success');
            await queueService.markAsSent(item.id);
            sendStatus('queue-update');

        } catch (error) {

            const statusCode = error.response?.status || 'N/A';
            const errorData = error.response?.data ? JSON.stringify(error.response.data) : error.message;

            console.log(`❌ Reintento falló ID ${item.id} - Status: ${statusCode}`);
            console.log(`Error details:`, errorData);

            if (statusCode === 404) {
                console.log(`🛑 Error permanente (404) detectado en reintento. Descartando ID ${item.id}`);
                await queueService.markAsFailed(item.id, `PERMANENT HTTP 404: ${errorData}`, true);
            } else {
                await queueService.markAsFailed(item.id, `HTTP ${statusCode}: ${errorData}`);
            }

            sendLog(`Reintento falló ID ${item.id} - HTTP ${statusCode}`, 'error');
            sendStatus('queue-update');
        }
    }
}

function startRetryWorker(statusCallback, logCallback) {
    sendStatus = statusCallback;
    sendLog = logCallback || (() => { });
    setInterval(processQueue, 15000); // cada 15 segundos
}

module.exports = { startRetryWorker, processQueue };
