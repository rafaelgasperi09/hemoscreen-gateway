const { dbPath } = require('../configService');
const db = new Database(dbPath);

console.log(`🧹 Iniciando limpieza masiva por contenido...`);

try {
    const rows = db.prepare("SELECT id, payload FROM outbound_queue").all();
    const map = new Map();
    const toDelete = [];

    for (const row of rows) {
        try {
            const payload = JSON.parse(row.payload);
            const patientId = payload.patient_identifier;
            const resultsHash = JSON.stringify(payload.observations);

            const key = `${patientId}_${resultsHash}`;

            if (map.has(key)) {
                toDelete.push(row.id);
            } else {
                map.set(key, row.id);
            }
        } catch (e) {
            // Ignorar errores de parseo
        }
    }

    console.log(`📊 Total a eliminar: ${toDelete.length}`);

    if (toDelete.length > 0) {
        const deleteStmt = db.prepare("DELETE FROM outbound_queue WHERE id = ?");

        let deletedCount = 0;
        db.transaction(() => {
            for (const id of toDelete) {
                deleteStmt.run(id);
                deletedCount++;
            }
        })();

        console.log(`✅ ¡Éxito! Se eliminaron ${deletedCount} registros duplicados.`);
    } else {
        console.log("✅ No se encontraron duplicados para eliminar.");
    }

} catch (err) {
    console.error("❌ Error durante la limpieza:", err);
} finally {
    db.close();
}
