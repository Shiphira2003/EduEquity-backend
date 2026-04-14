import fs from 'fs';
import path from 'path';
import { db } from '../src/db/db';
import { sql } from 'drizzle-orm';

async function runMigration() {
    try {
        const migrationPath = path.join(__dirname, '..', 'migrations', '002_add_admin_profile.sql');
        const sqlContent = fs.readFileSync(migrationPath, 'utf8');

        console.log('🚀 Running migration: 002_add_admin_profile.sql via Drizzle...');
        await db.execute(sql.raw(sqlContent));
        console.log('✅ Migration applied successfully!');

        process.exit(0);
    } catch (err) {
        console.error('❌ Error applying migration:', err);
        process.exit(1);
    }
}

runMigration();
