import fs from 'fs';
import path from 'path';
import { db } from '../src/db/db';
import { sql } from 'drizzle-orm';

async function runAllMigrations() {
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

    console.log(`🚀 Found ${files.length} migrations to apply.`);

    for (const file of files) {
        try {
            const sqlContent = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
            console.log(`⏳ Running migration: ${file}...`);
            await db.execute(sql.raw(sqlContent));
            console.log(`✅ ${file} applied successfully.`);
        } catch (err) {
            console.error(`❌ Error applying ${file}:`, err);
            // We continue or stop? Usually stop on error.
            process.exit(1);
        }
    }

    console.log('✨ All migrations completed successfully!');
    process.exit(0);
}

runAllMigrations();
