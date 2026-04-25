import { db } from './src/db/db';
import { sql } from 'drizzle-orm';

async function updateSchema() {
    try {
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS admin_community_messages (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log("admin_community_messages table created successfully.");
        process.exit(0);
    } catch (e) {
        console.error("Error creating table:", e);
        process.exit(1);
    }
}

updateSchema();
