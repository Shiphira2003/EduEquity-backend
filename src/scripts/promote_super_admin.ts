/**
 * Utility script to promote a user to SUPER_ADMIN role.
 * Usage: npx tsx scripts/promote_super_admin.ts <email>
 */
import { db } from "../db/db";
import { usersTable, rolesTable } from "../db/schema";
import { eq } from "drizzle-orm";

async function promoteUser(email: string) {
    if (!email) {
        console.error("Please provide an email address.");
        process.exit(1);
    }

    try {
        console.log(`Promoting ${email} to SUPER_ADMIN...`);

        // 2. Update user
        const result = await db.update(usersTable)
            .set({ role: "SUPER_ADMIN" } as any)
            .where(eq(usersTable.email, email))
            .returning();

        if (result.length === 0) {
            console.error(`User with email ${email} not found.`);
            process.exit(1);
        }

        console.log(`Successfully promoted ${email} to SUPER_ADMIN!`);
        process.exit(0);
    } catch (err) {
        console.error("Error promoting user:", err);
        process.exit(1);
    }
}

const email = process.argv[2];
promoteUser(email);
