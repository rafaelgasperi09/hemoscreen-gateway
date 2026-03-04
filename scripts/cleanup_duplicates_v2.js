const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'gateway.db');
const db = new Database(dbPath);

console.log(`🔍 Conectado a la base de datos en: ${dbPath}`);

try {
    // 1. Población de la columna control_id desde el payload
    const rows = db.prepare("SELECT id, payload FROM outbound_queue WHERE control_id IS NULL").all();
    console.log(`📝 Procesando ${rows.length} registros para extraer control_id del payload...`);

    const updateStmt = db.prepare("UPDATE outbound_queue SET control_id = ? WHERE id = ?");

    let updatedCount = 0;
    db.transaction(() => {
        for (const row of rows) {
            try {
                const payload = JSON.parse(row.payload);
                if (payload.control_id) {
                    updateStmt.run(payload.control_id, row.id);
                    updatedCount++;
                }
            } catch (e) {
                // Ignorar payloads malformados
            }
        }
    })();
    console.log(`✅ Se actualizaron ${updatedCount} registros con su control_id.`);

    // 2. Identificar y eliminar duplicados por control_id
    const duplicates = db.prepare(`
        SELECT control_id, COUNT(*) as count 
        FROM outbound_queue 
        WHERE control_id IS NOT NULL 
        GROUP BY control_id 
        HAVING count > 1
    `).all();

    console.log(`📊 Encontrados ${duplicates.length} IDs de control con duplicados.`);

    if (duplicates.length > 0) {
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

        console.log(`🧹 Limpieza completada. Se eliminaron ${totalDeleted} registros duplicados.`);
    } else {
        console.log("✅ No se encontraron duplicados persistentes.");
    }

} catch (err) {
    console.error("❌ Error durante el saneamiento:", err);
} finally {
    db.close();
}
