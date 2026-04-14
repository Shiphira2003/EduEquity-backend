import { db } from "../src/db/db";
import { sql } from "drizzle-orm";

async function run() {
    try {
        console.log("Checking if system_id column exists...");
        await db.execute(sql`ALTER TABLE admins ADD COLUMN IF NOT EXISTS system_id VARCHAR(50) UNIQUE;`);
        console.log("Migration successful or already applied.");
        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

run();
