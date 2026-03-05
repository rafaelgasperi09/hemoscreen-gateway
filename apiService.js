const axios = require('axios');
const queueService = require('./queueService');
const { writeToPhysicalLog } = require('./configService');

async function checkSaasStatus() {
    const config = require('./configService').getConfig();

    if (!config.apiUrl || !config.apiToken) {
        return { online: false, reason: 'not_configured' };
    }

    try {
        await axios.head(config.apiUrl, {
            timeout: 5000,
            headers: { Authorization: `Bearer ${config.apiToken}` }
        });
        return { online: true };
    } catch (error) {
        try {
            await axios.get(config.apiUrl, {
                timeout: 5000,
                validateStatus: () => true
            });
            return { online: true };
        } catch (err) {
            return {
                online: false,
                reason: err.code === 'ECONNREFUSED' ? 'connection_refused' : 'unreachable'
            };
        }
    }
}

async function sendLabResults(payload) {
    const config = require('./configService').getConfig();
    const controlId = payload.control_id || null;
    const patientId = payload.patient_identifier || null;
    const observationDttm = payload.observation_dttm || null;

    // 1. SIEMPRE intentar guardar/desduplicar primero
    const queueResult = await queueService.addToQueue(payload, controlId, patientId, observationDttm);

    // 2. Si NO es nuevo, significa que ya lo procesamos (o está en cola o ya se envió)
    if (!queueResult.isNew) {
        if (queueResult.status === 'sent') {
            console.log("✔ Registro omitido: Ya fue enviado previamente al SaaS.");
            return { success: true, alreadySent: true };
        } else if (queueResult.status === 'failed') {
            console.log("❌ Registro omitido: Ya falló anteriormente (404 u otro error permanente).");
            return { success: false, alreadyFailed: true };
        } else {
            console.log("⏳ Registro omitido: Ya existe en cola de pendientes.");
            return { queued: true, alreadyQueued: true };
        }
    }

    // 3. Si es nuevo y tenemos config, intentar envío inmediato
    if (!config.apiUrl || !config.apiToken) {
        console.log("⚠ API no configurada, queda en cola");
        return { queued: true };
    }

    try {
        const url = `${config.apiUrl}/api/v1/lab/hemoscreen`;
        const payloadSummary = `Paciente: ${payload.patient_identifier}, Obs: ${payload.observations?.length || 0}`;
        writeToPhysicalLog(`INTENTO ENVÍO SAAS: ${payloadSummary}`, 'API');

        console.log("📤 Enviando a:", url);

        const response = await axios.post(url, payload, {
            headers: {
                Authorization: `Bearer ${config.apiToken}`,
                "Content-Type": "application/json"
            },
            timeout: 10000
        });

        writeToPhysicalLog(`ÉXITO ENVÍO SAAS (${response.status}): ${payloadSummary}`, 'API');
        console.log("✔ Enviado correctamente:", response.status);

        // 4. Marcar como enviado en la DB para evitar reenvíos futuros
        await queueService.markAsSent(queueResult.id);

        return { success: true };

    } catch (error) {
        const statusCode = error.response?.status || 'N/A';
        const errorData = error.response?.data ? JSON.stringify(error.response.data) : error.message;

        writeToPhysicalLog(`ERROR ENVÍO SAAS (${statusCode}): ${errorData}`, 'ERROR');
        console.log("❌ Error enviando - HTTP", statusCode);

        if (statusCode === 404) {
            console.log("🛑 Error permanente (404): Paciente no encontrado o URL inválida. No se reintentará.");
            await queueService.markAsFailed(queueResult.id, `PERMANENT HTTP 404: ${errorData}`, true);
            return { success: false, error: 'permanent_failure' };
        } else {
            console.log("❌ Guardado en cola para reintento automático");
            await queueService.markAsFailed(queueResult.id, `HTTP ${statusCode}: ${errorData}`);
            return { queued: true };
        }
    }
}

async function getServiceRequest(hemoId) {
    const config = require('./configService').getConfig();

    if (!config.apiUrl || !config.apiToken) {
        return { success: false, error: 'Gateway no configurado' };
    }

    try {
        const url = `${config.apiUrl}/api/v1/lab/hemoscreen/service-request/${hemoId}`;
        console.log("🔍 Consultando SRID a:", url);

        const response = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${config.apiToken}`,
                "Content-Type": "application/json"
            },
            timeout: 5000
        });

        if (response.data && response.data.success) {
            return { success: true, data: response.data.data };
        } else {
            return { success: false, error: 'Respuesta no exitosa del SaaS' };
        }

    } catch (error) {
        const statusCode = error.response?.status || 'N/A';
        console.log(`❌ Falla consulta SRID (${hemoId}) - HTTP ${statusCode}`);
        return { success: false, error: error.message };
    }
}

module.exports = { sendLabResults, checkSaasStatus, getServiceRequest };
