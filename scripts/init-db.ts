import fs from 'fs';
import path from 'path';
import pool from '../src/db/db';

async function initDb() {
    try {
        const schemaPath = path.join(__dirname, '..', 'schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');

        console.log('🚀 Running schema.sql...');
        await pool.query(schemaSql);
        console.log('✅ Database initialized successfully!');

        process.exit(0);
    } catch (err) {
        console.error('❌ Error initializing database:', err);
        process.exit(1);
    }
}

initDb();
