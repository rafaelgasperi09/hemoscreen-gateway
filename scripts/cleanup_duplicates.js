const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'gateway.db');
const db = new Database(dbPath);

console.log(`🔍 Conectado a la base de datos en: ${dbPath}`);

try {
    // 1. Asegurar que la columna control_id existe
    const tableInfo = db.prepare("PRAGMA table_info(outbound_queue)").all();
    const hasControlId = tableInfo.some(col => col.name === 'control_id');

    if (!hasControlId) {
        console.log("📝 Añadiendo columna 'control_id' a 'outbound_queue'...");
        db.exec("ALTER TABLE outbound_queue ADD COLUMN control_id TEXT;");
        console.log("✅ Columna añadida.");
    } else {
        console.log("✅ La columna 'control_id' ya existe.");
    }

    // 2. Identificar duplicados
    // Nota: Como estamos añadiendo la columna, los registros antiguos tendrán null en control_id.
    // Solo podemos limpiar si el control_id está poblado.
    // Si el usuario reportó bucles ANTES de esta actualización, esos registros NO tendrán control_id.
    // En ese caso, quizás debamos identificar duplicados por payload?

    const duplicates = db.prepare(`
        SELECT control_id, COUNT(*) as count 
        FROM outbound_queue 
        WHERE control_id IS NOT NULL 
        GROUP BY control_id 
        HAVING count > 1
    `).all();

    console.log(`📊 Encontrados ${duplicates.length} IDs de control con duplicados.`);

    if (duplicates.length > 0) {
        // Limpieza por control_id
        const deleteStmt = db.prepare(`
            DELETE FROM outbound_queue 
            WHERE control_id = ? 
            AND id NOT IN (
                SELECT MIN(id) 
                FROM outbound_queue 
                WHERE control_id = ?
            )
        `);

        let totalDeleted = 0;
        db.transaction((dups) => {
            for (const dup of dups) {
                const info = deleteStmt.run(dup.control_id, dup.control_id);
                totalDeleted += info.changes;
            }
        })(duplicates);

        console.log(`🧹 Limpieza por control_id completada. Se eliminaron ${totalDeleted} registros duplicados.`);
    }

    // 3. Intento de limpieza por payload idéntico para registros sin control_id (opcional pero recomendado)
    console.log("🔍 Buscando duplicados por contenido del payload...");
    const payloadDuplicates = db.prepare(`
        SELECT payload, COUNT(*) as count 
        FROM outbound_queue 
        WHERE control_id IS NULL
        GROUP BY payload 
        HAVING count > 1
    `).all();

    console.log(`📊 Encontrados ${payloadDuplicates.length} payloads duplicados sin control_id.`);

    if (payloadDuplicates.length > 0) {
        const deletePayloadStmt = db.prepare(`
            DELETE FROM outbound_queue 
            WHERE payload = ? 
            AND control_id IS NULL
            AND id NOT IN (
                SELECT MIN(id) 
                FROM outbound_queue 
                WHERE payload = ?
                AND control_id IS NULL
            )
        `);

        let totalPayloadsDeleted = 0;
        db.transaction((dups) => {
            for (const dup of dups) {
                const info = deletePayloadStmt.run(dup.payload, dup.payload);
                totalPayloadsDeleted += info.changes;
            }
        })(payloadDuplicates);

        console.log(`🧹 Limpieza por payload completada. Se eliminaron ${totalPayloadsDeleted} registros duplicados.`);
    }

} catch (err) {
    console.error("❌ Error durante el saneamiento:", err);
} finally {
    db.close();
}
