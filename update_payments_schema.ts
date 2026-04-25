import { db } from './src/db/db';
import { sql } from 'drizzle-orm';

async function updateSchema() {
    try {
        console.log("Updating enum...");
        try {
            await db.execute(sql`ALTER TYPE "applicationStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';`);
            console.log("applicationStatusEnum updated.");
        } catch(err: any) {
            console.log("Enum might already exist or postgres skipped it:", err.message);
        }

        console.log("Creating payments table...");
        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS payments (
                id SERIAL PRIMARY KEY,
                application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                amount DECIMAL(12,2) NOT NULL,
                payment_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
                transaction_id VARCHAR(255),
                payment_method VARCHAR(100),
                payment_date TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log("payments table created successfully!");
        process.exit(0);
    } catch (e) {
        console.error("Error creating table:", e);
        process.exit(1);
    }
}

updateSchema();
