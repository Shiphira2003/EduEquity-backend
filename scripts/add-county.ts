import { db } from '../src/db/db';
import { sql } from 'drizzle-orm';

async function migrate() {
    try {
        console.log('🚀 Adding county and constituency columns via Drizzle...');
        await db.execute(sql.raw(`ALTER TABLE applications ADD COLUMN IF NOT EXISTS county VARCHAR(100);`));
        await db.execute(sql.raw(`ALTER TABLE applications ADD COLUMN IF NOT EXISTS constituency VARCHAR(100);`));
        console.log('✅ Columns added successfully');
    } catch (err) {
        console.error('❌ Error adding columns:', err);
    } finally {
        process.exit();
    }
}

migrate();
