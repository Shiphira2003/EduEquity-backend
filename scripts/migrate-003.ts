import fs from 'fs';
import path from 'path';
import { db } from '../src/db/db';
import { sql } from 'drizzle-orm';

async function runMigration() {
    try {
        const migrationPath = path.join(__dirname, '..', 'migrations', '003_add_notifications.sql');
        const sqlContent = fs.readFileSync(migrationPath, 'utf8');

        console.log('🚀 Running migration: 003_add_notifications.sql via Drizzle...');
        await db.execute(sql.raw(sqlContent));
        console.log('✅ Migration applied successfully!');

        process.exit(0);
    } catch (err) {
        console.error('❌ Error applying migration:', err);
        process.exit(1);
    }
}

runMigration();
