import { db } from './src/db/db';
import { sql } from 'drizzle-orm';

async function cleanupSchema() {
    try {
        console.log("Adding unified identity columns to users table (using VARCHAR for compatibility)...");
        
        // 1. Add columns to users
        await db.execute(sql`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS full_name VARCHAR(255),
            ADD COLUMN IF NOT EXISTS national_id VARCHAR(50),
            ADD COLUMN IF NOT EXISTS system_id VARCHAR(50),
            ADD COLUMN IF NOT EXISTS avatar TEXT,
            ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'STUDENT';
        `);

        // 2. Migration: Copy data from Roles to Users (role string)
        console.log("Migrating roles from roles table to users.role column...");
        await db.execute(sql`
            UPDATE users u
            SET role = r.name
            FROM roles r
            WHERE u.role_id = r.id;
        `);

        // 3. Migration: Sync Student Names, IDs & Avatars to Users
        console.log("Syncing Student profiles to Users table...");
        await db.execute(sql`
            UPDATE users u
            SET full_name = s.full_name,
                national_id = s.national_id,
                avatar = s.avatar
            FROM students s
            WHERE u.id = s.user_id;
        `);

        // 4. Migration: Sync Admin Names, IDs & Avatars to Users
        console.log("Syncing Admin profiles to Users table...");
        await db.execute(sql`
            UPDATE users u
            SET full_name = a.full_name,
                national_id = a.id_number,
                system_id = a.system_id,
                avatar = a.image_icon
            FROM admins a
            WHERE u.id = a.user_id;
        `);

        console.log("Restructuring successful! Users table is now a complete identity table.");
        process.exit(0);
    } catch (e) {
        console.error("Error during restructure:", e);
        process.exit(1);
    }
}

cleanupSchema();
