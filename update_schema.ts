import { db } from './src/db/db';
import { sql } from 'drizzle-orm';

async function updateSchema() {
    try {
        await db.execute(sql`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS target_audience VARCHAR(50) DEFAULT 'STUDENTS';`);
        console.log("Column target_audience added successfully.");
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

updateSchema();
