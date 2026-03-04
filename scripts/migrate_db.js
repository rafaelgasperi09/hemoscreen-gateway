const { dbPath } = require('../configService');
const db = new Database(dbPath);

console.log(`🚀 Iniciando migración de esquema en: ${dbPath}`);

try {
    const tableInfo = db.prepare("PRAGMA table_info(outbound_queue)").all();
    const columns = tableInfo.map(col => col.name);

    const neededColumns = [
        { name: 'control_id', type: 'TEXT' },
        { name: 'patient_id', type: 'TEXT' },
        { name: 'observation_dttm', type: 'TEXT' }
    ];

    for (const col of neededColumns) {
        if (!columns.includes(col.name)) {
            console.log(`📝 Añadiendo columna '${col.name}'...`);
            db.exec(`ALTER TABLE outbound_queue ADD COLUMN ${col.name} ${col.type};`);
            console.log(`✅ Columna '${col.name}' añadida.`);
        } else {
            console.log(`✅ La columna '${col.name}' ya existe.`);
        }
    }

    console.log("🏁 Migración completada con éxito.");

} catch (err) {
    console.error("❌ Error durante la migración:", err);
} finally {
    db.close();
}
