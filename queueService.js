const Database = require('better-sqlite3');
const { dbPath } = require('./configService');

const db = new Database(dbPath);

// Inicializar tabla si no existe
// Añadimos control_id para evitar duplicados de la misma sesión de sincronización
db.exec(`
    CREATE TABLE IF NOT EXISTS outbound_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payload TEXT NOT NULL,
        control_id TEXT,
        patient_id TEXT,
        observation_dttm TEXT,
        status TEXT DEFAULT 'pending',
        attempts INTEGER DEFAULT 0,
        last_error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

async function addToQueue(payload, controlId = null, patientId = null, observationDttm = null) {
    // 1. Desduplicación por control_id (mismo mensaje en la misma ráfaga)
    if (controlId) {
        const existing = db.prepare(`
            SELECT id, status FROM outbound_queue 
            WHERE control_id = ? 
            AND created_at > datetime('now', '-1 day')
        `).get(controlId);

        if (existing) {
            console.log(`⚠️ Duplicado detectado por ControlID ${controlId}. Status: ${existing.status}`);
            return { id: existing.id, isNew: false, status: existing.status };
        }
    }

    // 2. Desduplicación por "Huella Dactilar" Biológica (Paciente + Fecha/Hora Observación)
    if (patientId && observationDttm) {
        const existingBio = db.prepare(`
            SELECT id, status FROM outbound_queue 
            WHERE patient_id = ? 
            AND observation_dttm = ?
        `).get(patientId, observationDttm);

        if (existingBio) {
            console.log(`⚠️ Registro biológico idéntico para ${patientId} en ${observationDttm}. Status: ${existingBio.status}`);
            return { id: existingBio.id, isNew: false, status: existingBio.status };
        }
    }

    // 3. Inserción normal
    const info = db.prepare(`
        INSERT INTO outbound_queue (payload, control_id, patient_id, observation_dttm) 
        VALUES (?, ?, ?, ?)
    `).run(JSON.stringify(payload), controlId, patientId, observationDttm);

    return { id: info.lastInsertRowid, isNew: true, status: 'pending' };
}

async function getPending(limit = 5) {
    return db.prepare(`SELECT * FROM outbound_queue WHERE status = 'pending' LIMIT ?`).all(limit);
}

async function markAsSent(id) {
    db.prepare(`UPDATE outbound_queue SET status = 'sent' WHERE id = ?`).run(id);
}

async function markAsFailed(id, error, isPermanent = false) {
    if (isPermanent) {
        db.prepare(`UPDATE outbound_queue SET attempts = attempts + 1, last_error = ?, status = 'failed' WHERE id = ?`).run(error, id);
    } else {
        db.prepare(`UPDATE outbound_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?`).run(error, id);
    }
}

async function countPending() {
    // Incluir fallidos para que el usuario sepa que hay algo que corregir
    const row = db.prepare(`SELECT COUNT(*) as total FROM outbound_queue WHERE status IN ('pending', 'failed')`).get();
    return row ? row.total : 0;
}

async function getAllPending() {
    // Incluir fallidos para permitir edición de ID
    return db.prepare(`SELECT * FROM outbound_queue WHERE status IN ('pending', 'failed') ORDER BY created_at DESC`).all();
}

async function updatePatientId(id, newPatientId) {
    const row = db.prepare(`SELECT payload FROM outbound_queue WHERE id = ?`).get(id);
    if (!row) throw new Error("Registro no encontrado");

    let payload = JSON.parse(row.payload);
    payload.patient_identifier = newPatientId;

    db.prepare(`UPDATE outbound_queue SET payload = ?, attempts = 0, last_error = NULL, status = 'pending' WHERE id = ?`)
        .run(JSON.stringify(payload), id);

    return true;
}

async function clearHistory() {
    db.prepare(`DELETE FROM outbound_queue`).run();
    return true;
}

module.exports = {
    addToQueue,
    getPending,
    markAsSent,
    markAsFailed,
    countPending,
    getAllPending,
    updatePatientId,
    clearHistory
};
