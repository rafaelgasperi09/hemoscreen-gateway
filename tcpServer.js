const net = require('net');
const fs = require('fs');
const path = require('path');
const { XMLParser } = require("fast-xml-parser");
const apiService = require('./apiService');
const { getConfig, logPath } = require('./configService');

const LOG_FILE = logPath;

function writeToPhysicalLog(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${type}] ${message}\n`;
    fs.appendFileSync(LOG_FILE, logEntry);
}

function startTCPServer(sendStatus, sendLog) {

    const parser = new XMLParser({
        ignoreAttributes: false,
        ignoreDeclaration: true,
        removeNSPrefix: true
    });

    const config = getConfig();
    const port = config.tcpPort || 5000;

    let controlIdCounter = 1;

    const server = net.createServer((socket) => {
        socket.setKeepAlive(true, 60000);
        socket.setNoDelay(true);
        socket.setTimeout(0);

        const remoteAddress = socket.remoteAddress;
        writeToPhysicalLog(`Nueva conexión desde ${remoteAddress}`, 'CONN');

        sendStatus('device-status', 'connected');
        sendLog('Dispositivo médico conectado', 'info');

        let buffer = '';

        socket.on('data', async (data) => {
            const rawData = data.toString();
            writeToPhysicalLog(`Recibidos ${data.length} bytes`, 'RECV');
            buffer += rawData;

            const terminators = [
                '</OBS.R01>', '</HEL.R01>', '</DST.R01>', '</ACK.R01>',
                '</END.R01>', '</EOT.R01>', '</ESC.R01>', '</REQ.R01>'
            ];

            let found;
            do {
                found = false;
                let earliestPos = Infinity;
                let terminatorUsed = '';

                for (const t of terminators) {
                    const pos = buffer.indexOf(t);
                    if (pos !== -1 && pos < earliestPos) {
                        earliestPos = pos;
                        terminatorUsed = t;
                        found = true;
                    }
                }

                if (found) {
                    const endPos = earliestPos + terminatorUsed.length;
                    const message = buffer.substring(0, endPos);
                    buffer = buffer.substring(endPos);

                    try {
                        const startXml = message.indexOf('<');
                        if (startXml === -1) continue;
                        const cleanMessage = message.substring(startXml).trim();

                        const jsonObj = parser.parse(cleanMessage);
                        const messageType = Object.keys(jsonObj).find(key =>
                            /^[A-Z]{3}\.R01$/i.test(key)
                        );

                        if (!messageType) continue;

                        const rootNode = jsonObj[messageType];
                        const receivedControlId = rootNode?.HDR?.['HDR.control_id']?.['@_V'] || "1";
                        const versionId = "POCT1";

                        writeToPhysicalLog(`Procesando ${messageType} (ID: ${receivedControlId})`, 'PROC');

                        if (messageType === "OBS.R01") {
                            let services = rootNode?.SVC;
                            if (services) {
                                if (!Array.isArray(services)) services = [services];

                                for (const svc of services) {
                                    const patientId = svc?.PT?.["PT.patient_id"]?.["@_V"] || "SIN_ID";
                                    let observations = svc?.PT?.OBS;

                                    if (observations) {
                                        if (!Array.isArray(observations)) observations = [observations];

                                        const results = observations.map(obs => ({
                                            loinc: obs["OBS.observation_id"]?.["@_V"],
                                            name: obs["OBS.observation_id"]?.["@_DN"],
                                            value: parseFloat(obs["OBS.value"]?.["@_V"]),
                                            unit: obs["OBS.value"]?.["@_U"]
                                        }));

                                        const observationDttm = svc?.["SVC.observation_dttm"]?.["@_V"] || new Date().toISOString();

                                        try {
                                            const result = await apiService.sendLabResults({
                                                control_id: receivedControlId,
                                                message_type: messageType,
                                                patient_identifier: patientId,
                                                observation_dttm: observationDttm,
                                                device_serial: config.deviceSerial || 'HS-LOCAL-01',
                                                observations: results
                                            });

                                            if (result.alreadySent) {
                                                writeToPhysicalLog(`Resultado omitido (Duplicado ya enviado): Paciente ${patientId}`, 'INFO');
                                            } else if (result.alreadyQueued) {
                                                writeToPhysicalLog(`Resultado omitido (Ya está en cola): Paciente ${patientId}`, 'INFO');
                                            } else if (result.success) {
                                                writeToPhysicalLog(`Resultado procesado y enviado: Paciente ${patientId}`, 'INFO');
                                            } else if (result.queued) {
                                                writeToPhysicalLog(`Resultado encolado (Offline): Paciente ${patientId}`, 'INFO');
                                            }

                                            // SOLICITUD ENCADENADA: Pedimos el siguiente resultado SIEMPRE para vaciar la cola.
                                            // Confiamos en el ACK para que el equipo avance al siguiente registro.
                                            setTimeout(() => {
                                                const nextReqId = controlIdCounter++;
                                                const nextReqMsg = `<?xml version="1.0" encoding="utf-8"?><REQ.R01><HDR><HDR.control_id V="${nextReqId}"/><HDR.version_id V="${versionId}"/></HDR><REQ><REQ.request_cd V="ROBS"/></REQ></REQ.R01>`;
                                                socket.write(nextReqMsg);
                                                writeToPhysicalLog(`Solicitando siguiente resultado (REQ ID: ${nextReqId})`, 'SEND');
                                            }, 500);
                                        } catch (err) {
                                            writeToPhysicalLog(`Error procesando: ${err.message}`, 'ERROR');
                                        }
                                    }
                                }
                            }
                        } else if (messageType === "DST.R01") {
                            const pending = parseInt(rootNode?.DST?.["DST.new_observations_qty"]?.["@_V"] || "0");
                            writeToPhysicalLog(`Pendientes reportados: ${pending}`, 'INFO');

                            // Pedimos resultados SIEMPRE al recibir el estado, incluso si dice 0, 
                            // para asegurar que no hay registros "viejos" pegados.
                            setTimeout(() => {
                                const reqId = controlIdCounter++;
                                const reqMsg = `<?xml version="1.0" encoding="utf-8"?><REQ.R01><HDR><HDR.control_id V="${reqId}"/><HDR.version_id V="${versionId}"/></HDR><REQ><REQ.request_cd V="ROBS"/></REQ></REQ.R01>`;
                                socket.write(reqMsg);
                                writeToPhysicalLog(`Solicitud inicial tras estado (REQ ID: ${reqId})`, 'SEND');
                            }, 500);
                        }
                        else if (messageType === "REQ.R01") {
                            const requestCd = rootNode?.REQ?.["REQ.request_cd"]?.["@_V"];
                            const patientId = rootNode?.REQ?.PT?.["PT.patient_id"]?.["@_V"];

                            if (requestCd === "RPAT" && patientId) {
                                sendLog(`Consultando orden: ${patientId}`, 'info');
                                try {
                                    const response = await apiService.getServiceRequest(patientId);
                                    if (response.success) {
                                        const p = response.data;
                                        const ptlId = controlIdCounter++;
                                        const now = new Date().toISOString().replace('Z', '+00:00');
                                        let gender = "U";
                                        if (p.patient_gender === "MALE") gender = "M";
                                        else if (p.patient_gender === "FEMALE") gender = "F";

                                        const ptlMsg = `<?xml version="1.0" encoding="utf-8"?><PTL.R01><HDR><HDR.control_id V="${ptlId}"/><HDR.version_id V="${versionId}"/><HDR.creation_dttm V="${now}"/></HDR><PT><PT.patient_id V="${p.hemo_identification}"/><PT.name V="${p.patient_name}"/><PT.birth_date V="${p.patient_birth_date}"/><PT.gender_cd V="${gender}"/></PT></PTL.R01>`;
                                        socket.write(ptlMsg);
                                        sendLog(`Orden validada: ${p.patient_name}`, 'success');
                                    } else {
                                        const ptlId = controlIdCounter++;
                                        const now = new Date().toISOString().replace('Z', '+00:00');
                                        const emptyPtl = `<?xml version="1.0" encoding="utf-8"?><PTL.R01><HDR><HDR.control_id V="${ptlId}"/><HDR.version_id V="${versionId}"/><HDR.creation_dttm V="${now}"/></HDR></PTL.R01>`;
                                        socket.write(emptyPtl);
                                        sendLog(`Orden no encontrada: ${patientId}`, 'warning');
                                    }
                                } catch (err) {
                                    writeToPhysicalLog(`Error RPAT: ${err.message}`, 'ERROR');
                                }
                            }
                        }

                        // ACK Estándar (No responder a ACKs para evitar bucles infinitos)
                        if (messageType !== "ACK.R01") {
                            const myAckControlId = controlIdCounter++;
                            const ack = `<?xml version="1.0" encoding="utf-8"?><ACK.R01><HDR><HDR.control_id V="${myAckControlId}"/><HDR.version_id V="${versionId}"/></HDR><ACK><ACK.type_cd V="AA"/><ACK.ack_control_id V="${receivedControlId}"/></ACK></ACK.R01>`;
                            socket.write(ack);
                            writeToPhysicalLog(`ACK enviado para ${messageType} (ID: ${receivedControlId})`, 'SEND');
                        }

                        if (messageType === 'HEL.R01') {
                            sendLog('Handshake completado', 'success');
                        }

                    } catch (error) {
                        writeToPhysicalLog(`Error bloque: ${error.message}`, 'FATAL');
                    }
                }
            } while (found && buffer.length > 0);
        });

        socket.on('error', (err) => {
            writeToPhysicalLog(`Error socket: ${err.message}`, 'SOCK_ERR');
            sendStatus('device-status', 'disconnected');
        });

        socket.on('close', () => {
            writeToPhysicalLog(`Conexión cerrada`, 'DISCONN');
            sendStatus('device-status', 'disconnected');
        });

    });

    server.listen(port, () => {
        writeToPhysicalLog(`Servidor iniciado en puerto ${port}`, 'START');
        sendLog(`TCP Server escuchando en puerto ${port}`, 'success');
    });
}

module.exports = { startTCPServer };
