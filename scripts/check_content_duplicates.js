const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'gateway.db');
const db = new Database(dbPath);

console.log(`🔍 Buscando duplicados biológicos...`);

try {
    const rows = db.prepare("SELECT id, payload FROM outbound_queue").all();
    const map = new Map();
    const duplicates = [];

    for (const row of rows) {
        try {
            const payload = JSON.parse(row.payload);
            // Intentar encontrar la fecha de observación en el payload original (si existiera)
            // o extraerla si el payload es el XML (pero aquí el payload es JSON)

            // Si el payload JSON no la tiene, no podemos hacer mucho con los registros existentes
            // a menos que re-parseemos el XML si lo guardamos (pero guardamos JSON filtrado).

            // Vamos a ver qué hay en el JSON
            if (row.id === 475) console.log("Ejemplo de payload:", JSON.stringify(payload, null, 2));

            const patientId = payload.patient_identifier;
            const resultsHash = JSON.stringify(payload.observations); // Hash de los resultados

            const key = `${patientId}_${resultsHash}`;

            if (map.has(key)) {
                duplicates.push({ original: map.get(key), duplicate: row.id });
            } else {
                map.set(key, row.id);
            }
        } catch (e) { }
    }

    console.log(`📊 Encontrados ${duplicates.length} posibles duplicados por contenido idéntico.`);

    if (duplicates.length > 0) {
        console.log("Primeros 5 duplicados:");
        console.log(duplicates.slice(0, 5));
    }

} catch (err) {
    console.error(err);
} finally {
    db.close();
}
