import fs from 'fs';
import path from 'path';
import pool from '../src/db/db';

async function runMigration() {
    try {
        const migrationPath = path.join(__dirname, '..', 'migrations', '002_add_admin_profile.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        console.log('Running migration: 002_add_admin_profile.sql');
        await pool.query(sql);
        console.log('Migration applied successfully!');

        process.exit(0);
    } catch (err) {
        console.error('Error applying migration:', err);
        process.exit(1);
    }
}

runMigration();
