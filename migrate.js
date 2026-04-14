// Modernized migration runner using Drizzle
// This script runs the 006_feature_update.sql migration

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const db = drizzle(pool);

async function runMigration() {
    try {
        const migrationPath = path.join(__dirname, 'migrations', '006_feature_update.sql');
        const sqlContent = fs.readFileSync(migrationPath, 'utf8');

        console.log('🚀 Running migration: 006_feature_update.sql via Drizzle (migrate.js)...');
        // In raw drizzle (CJS), we can use db.execute
        const { sql } = require('drizzle-orm');
        await db.execute(sql.raw(sqlContent));
        
        console.log('✅ Migration applied successfully!');
    } catch (err) {
        console.error('❌ Error applying migration:', err);
    } finally {
        await pool.end();
    }
}

runMigration();
