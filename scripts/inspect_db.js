const { dbPath } = require('../configService');
const db = new Database(dbPath);

console.log(`🔍 Inspeccionando base de datos en: ${dbPath}`);

try {
    const rows = db.prepare("SELECT * FROM outbound_queue ORDER BY created_at DESC LIMIT 10").all();
    console.log(JSON.stringify(rows, null, 2));
} catch (err) {
    console.error(err);
} finally {
    db.close();
}
